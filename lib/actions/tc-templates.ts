'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '../auth'
import { can } from '../permissions'
import { prisma } from '../prisma'
import { logAudit } from '../audit'
import { tcTemplateSchema, type TcTemplateInput } from '../validations/tc-templates'
import { Role } from '../generated/prisma/enums'

// ─── Serialisable types ───────────────────────────────────────────────────────

export type TcTemplateListItem = {
  id: string
  name: string
  bodyRichText: string
  categories: string[]
  isArchived: boolean
  isLocked: boolean
  createdAt: string
  updatedAt: string
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getTcTemplates(): Promise<TcTemplateListItem[]> {
  const templates = await prisma.tCTemplate.findMany({
    orderBy: [{ isArchived: 'asc' }, { name: 'asc' }],
  })
  return templates.map(toListItem)
}

export async function getServiceCategories(): Promise<string[]> {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  })
  return services.map((s) => s.category)
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createTcTemplate(
  raw: TcTemplateInput,
): Promise<{ success: true; id: string } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const parsed = tcTemplateSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const data = parsed.data

  const template = await prisma.tCTemplate.create({
    data: {
      name: data.name,
      bodyRichText: data.bodyRichText,
      categories: data.categories,
    },
  })

  await logAudit('TCTemplate', template.id, 'created', session.user.id, {
    after: { name: template.name, categories: template.categories },
  })

  revalidatePath('/tc-templates')
  return { success: true, id: template.id }
}

export async function updateTcTemplate(
  templateId: string,
  raw: TcTemplateInput,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const parsed = tcTemplateSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const data = parsed.data

  const before = await prisma.tCTemplate.findUnique({ where: { id: templateId } })
  if (!before) return { error: 'Template not found' }
  if (before.isLocked) return { error: 'This template is locked and cannot be edited. Duplicate it to create an editable copy.' }

  const updated = await prisma.tCTemplate.update({
    where: { id: templateId },
    data: {
      name: data.name,
      bodyRichText: data.bodyRichText,
      categories: data.categories,
    },
  })

  await logAudit('TCTemplate', templateId, 'updated', session.user.id, {
    before: { name: before.name, categories: before.categories },
    after: { name: updated.name, categories: updated.categories },
  })

  revalidatePath('/tc-templates')
  return { success: true }
}

export async function lockTcTemplate(
  templateId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (session.user.role !== Role.SUPER_ADMIN) return { error: 'Only Super Admins can lock templates' }

  const template = await prisma.tCTemplate.findUnique({ where: { id: templateId } })
  if (!template) return { error: 'Template not found' }
  if (template.isLocked) return { error: 'Template is already locked' }

  await prisma.tCTemplate.update({
    where: { id: templateId },
    data: { isLocked: true },
  })

  await logAudit('TCTemplate', templateId, 'locked', session.user.id)

  revalidatePath('/tc-templates')
  return { success: true }
}

export async function unlockTcTemplate(
  templateId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (session.user.role !== Role.SUPER_ADMIN) return { error: 'Only Super Admins can unlock templates' }

  const template = await prisma.tCTemplate.findUnique({ where: { id: templateId } })
  if (!template) return { error: 'Template not found' }
  if (!template.isLocked) return { error: 'Template is not locked' }

  await prisma.tCTemplate.update({
    where: { id: templateId },
    data: { isLocked: false },
  })

  await logAudit('TCTemplate', templateId, 'unlocked', session.user.id)

  revalidatePath('/tc-templates')
  return { success: true }
}

export async function archiveTcTemplate(
  templateId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const template = await prisma.tCTemplate.findUnique({ where: { id: templateId } })
  if (!template) return { error: 'Template not found' }
  if (template.isArchived) return { error: 'Template is already archived' }

  await prisma.tCTemplate.update({
    where: { id: templateId },
    data: { isArchived: true },
  })

  await logAudit('TCTemplate', templateId, 'archived', session.user.id)

  revalidatePath('/tc-templates')
  return { success: true }
}

export async function restoreTcTemplate(
  templateId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const template = await prisma.tCTemplate.findUnique({ where: { id: templateId } })
  if (!template) return { error: 'Template not found' }
  if (!template.isArchived) return { error: 'Template is not archived' }

  await prisma.tCTemplate.update({
    where: { id: templateId },
    data: { isArchived: false },
  })

  await logAudit('TCTemplate', templateId, 'restored', session.user.id)

  revalidatePath('/tc-templates')
  return { success: true }
}

export async function duplicateTcTemplate(
  templateId: string,
): Promise<{ success: true; id: string } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const source = await prisma.tCTemplate.findUnique({ where: { id: templateId } })
  if (!source) return { error: 'Template not found' }

  const copy = await prisma.tCTemplate.create({
    data: {
      name: `${source.name} (copy)`,
      bodyRichText: source.bodyRichText,
      categories: source.categories,
      isLocked: false,
      isArchived: false,
    },
  })

  await logAudit('TCTemplate', copy.id, 'duplicated', session.user.id, {
    after: { sourceId: templateId, name: copy.name },
  })

  revalidatePath('/tc-templates')
  return { success: true, id: copy.id }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toListItem(t: {
  id: string
  name: string
  bodyRichText: string
  categories: string[]
  isArchived: boolean
  isLocked: boolean
  createdAt: Date
  updatedAt: Date
}): TcTemplateListItem {
  return {
    id: t.id,
    name: t.name,
    bodyRichText: t.bodyRichText,
    categories: t.categories,
    isArchived: t.isArchived,
    isLocked: t.isLocked,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}
