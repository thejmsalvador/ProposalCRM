'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '../auth'
import { can } from '../permissions'
import { prisma } from '../prisma'
import { getSupabaseAdmin } from '../supabaseAdmin'
import type { Role } from '../generated/prisma/enums'
import { logAudit } from '../audit'
import {
  inviteUserSchema,
  updateUserSchema,
  createTeamSchema,
  type InviteUserInput,
  type UpdateUserInput,
  type CreateTeamInput,
} from '../validations/users'

// ─── Serialisable types (safe to pass to Client Components) ─────────────────

export type UserListItem = {
  id: string
  name: string
  email: string
  role: string
  jobTitle: string | null
  teamId: string | null
  teamName: string | null
  defaultApproverId: string | null
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export type TeamListItem = {
  id: string
  name: string
  managerId: string | null
  managerName: string | null
  memberCount: number
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getUsers(): Promise<UserListItem[]> {
  const users = await prisma.user.findMany({
    include: { team: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    jobTitle: u.jobTitle,
    teamId: u.teamId,
    teamName: u.team?.name ?? null,
    defaultApproverId: u.defaultApproverId,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  }))
}

export async function getTeams(): Promise<TeamListItem[]> {
  const teams = await prisma.team.findMany({
    include: { members: { select: { id: true } } },
    orderBy: { name: 'asc' },
  })

  const managerIds = teams.map((t) => t.managerId).filter(Boolean) as string[]
  const managers =
    managerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: managerIds } },
          select: { id: true, name: true },
        })
      : []
  const managerMap = new Map(managers.map((m) => [m.id, m.name]))

  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    managerId: t.managerId,
    managerName: t.managerId ? (managerMap.get(t.managerId) ?? null) : null,
    memberCount: t.members.length,
  }))
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function inviteUser(
  raw: InviteUserInput,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:users')) return { error: 'Unauthorized' }

  const parsed = inviteUserSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const data = parsed.data

  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) return { error: 'A user with this email already exists.' }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { name: data.name },
    })

  if (authError) {
    return { error: authError.message }
  }

  try {
    await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        role: data.role as Role,
        jobTitle: data.jobTitle || null,
        teamId: data.teamId || null,
        isActive: true,
      },
    })
  } catch {
    // Prisma create failed — clean up the Supabase Auth user so state stays consistent
    if (authData?.user?.id) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    }
    return { error: 'Failed to create user record. Invite cancelled.' }
  }

  revalidatePath('/users')
  return { success: true }
}

export async function updateUser(
  userId: string,
  raw: UpdateUserInput,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:users')) return { error: 'Unauthorized' }

  const parsed = updateUserSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const data = parsed.data

  const before = await prisma.user.findUnique({ where: { id: userId } })
  if (!before) return { error: 'User not found' }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      jobTitle: data.jobTitle || null,
      role: data.role as Role,
      teamId: data.teamId || null,
      defaultApproverId: data.defaultApproverId || null,
      isActive: data.isActive,
    },
  })

  const diff: Record<string, unknown> = {}
  if (before.name !== data.name) diff.name = { from: before.name, to: data.name }
  if (before.role !== data.role) diff.role = { from: before.role, to: data.role }
  if (before.isActive !== data.isActive)
    diff.isActive = { from: before.isActive, to: data.isActive }
  if (before.teamId !== (data.teamId || null))
    diff.teamId = { from: before.teamId, to: data.teamId || null }

  await logAudit('User', userId, 'updated', session.user.id, diff)

  revalidatePath('/users')
  return { success: true }
}

export async function toggleUserActive(
  userId: string,
  currentIsActive: boolean,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:users')) return { error: 'Unauthorized' }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: !currentIsActive },
  })

  await logAudit('User', userId, currentIsActive ? 'deactivated' : 'reactivated', session.user.id)

  revalidatePath('/users')
  return { success: true }
}

export async function createTeam(
  raw: CreateTeamInput,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:users')) return { error: 'Unauthorized' }

  const parsed = createTeamSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const data = parsed.data

  await prisma.team.create({
    data: {
      name: data.name,
      managerId: data.managerId || null,
    },
  })

  revalidatePath('/users')
  return { success: true }
}
