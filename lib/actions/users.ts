'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '../auth'
import { can } from '../permissions'
import { prisma } from '../prisma'
import { getSupabaseAdmin } from '../supabaseAdmin'
import { supabaseUrl, supabaseKey } from '@/utils/supabase/env'
import { rateLimit } from '../rate-limit'
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
import { updateOwnProfileSchema, type UpdateOwnProfileInput } from '../validations/profile'

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
  signatureImageUrl: string | null
  isActive: boolean
  deletedAt: string | null
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

// Returns ALL users, including soft-deleted ones. The Users list hides deleted
// records by default and reveals them behind a "Show deleted" toggle, so the
// client needs both sets; deletedAt lets it partition them.
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
    signatureImageUrl: u.signatureImageUrl,
    isActive: u.isActive,
    deletedAt: u.deletedAt?.toISOString() ?? null,
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
      signatureImageUrl: data.signatureImageUrl || null,
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

/**
 * Soft-deletes a user: stamps `deletedAt` so the row is hidden from the Users
 * list and blocked from signing in, while KEEPING the record (and therefore all
 * their proposal / approval / audit history) intact. The Supabase Auth login is
 * removed so they can no longer authenticate. Intentionally guarded:
 *
 *  1. Restricted to roles with the `delete:user` permission (SUPER_ADMIN, COO,
 *     CEO) — a stricter set than the invite/edit flows, which are SUPER_ADMIN
 *     only via `manage:users`.
 *  2. The user must ALREADY be deactivated (isActive = false). Deactivation is
 *     the deliberate first step; only then does delete become available.
 *  3. Requires the CALLER to re-enter their OWN password as a second confirm,
 *     re-verified server-side against Supabase Auth. Rate-limited to blunt
 *     brute-force guessing.
 *  4. Refuses to delete your own account.
 */
export async function deleteUser(
  userId: string,
  password: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'delete:user')) return { error: 'Unauthorized' }

  if (userId === session.user.id) {
    return { error: 'You cannot delete your own account.' }
  }

  if (!password) {
    return { error: 'Password is required to confirm deletion.' }
  }

  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) return { error: 'User not found.' }
  if (target.deletedAt) return { error: 'This user has already been deleted.' }
  if (target.isActive) {
    return { error: 'Deactivate this user before deleting them.' }
  }

  // Throttle password-guessing on this sensitive action.
  const limit = rateLimit(`delete-user:${session.user.id}`, 5, 5 * 60 * 1000)
  if (!limit.ok) {
    return { error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` }
  }

  // Re-verify the caller's password against Supabase Auth. Use a throwaway
  // client (persistSession:false) so this sign-in check never touches the
  // caller's real session cookies.
  const verifier = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: authError } = await verifier.auth.signInWithPassword({
    email: session.user.email,
    password,
  })
  if (authError) {
    return { error: 'Incorrect password. Deletion cancelled.' }
  }

  // Remove the Supabase Auth login so the deleted user can never authenticate.
  // Best-effort: look the auth user up by email (there is no direct
  // get-by-email admin API, so page through the user list).
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const perPage = 1000
    let page = 1
    let authUserId: string | null = null
    // Cap the scan so a runaway loop can't hang the request.
    for (let i = 0; i < 20 && !authUserId; i++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
      if (error) break
      const match = data.users.find(
        (u) => u.email?.toLowerCase() === target.email.toLowerCase(),
      )
      if (match) authUserId = match.id
      if (data.users.length < perPage) break
      page += 1
    }
    if (authUserId) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId)
    }
  } catch {
    // Non-fatal: the soft-delete below is what revokes app access
    // (getSession() returns null once deletedAt is set).
  }

  // Soft delete: keep the row (and all its history) but hide + lock it out.
  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), isActive: false },
  })

  await logAudit('User', userId, 'deleted_user', session.user.id, {
    deletedUserEmail: target.email,
    deletedUserName: target.name,
  })

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

// ─── Self-service profile (any authenticated user, own record only) ─────────

/**
 * Updates the CALLER'S OWN name/jobTitle/signatureImageUrl/avatarUrl.
 * Deliberately takes no userId — the target is always derived from
 * getSession(), so there is no way to edit another user's record through
 * this action. Role/team/isActive/approver changes remain SUPER_ADMIN-only
 * via updateUser() above.
 */
export async function updateOwnProfile(
  raw: UpdateOwnProfileInput,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = updateOwnProfileSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const data = parsed.data

  const before = session.user

  await prisma.user.update({
    where: { id: before.id },
    data: {
      name: data.name,
      jobTitle: data.jobTitle || null,
      signatureImageUrl: data.signatureImageUrl || null,
      avatarUrl: data.avatarUrl || null,
    },
  })

  const diff: Record<string, unknown> = {}
  if (before.name !== data.name) diff.name = { from: before.name, to: data.name }
  if ((before.jobTitle ?? '') !== (data.jobTitle ?? ''))
    diff.jobTitle = { from: before.jobTitle, to: data.jobTitle || null }

  await logAudit('User', before.id, 'updated_own_profile', before.id, diff)

  revalidatePath('/profile')
  // Sidebar/TopHeader/BottomNav render name/avatarUrl in the shared layout.
  revalidatePath('/', 'layout')
  return { success: true }
}
