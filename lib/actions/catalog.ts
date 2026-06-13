'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '../auth'
import { can } from '../permissions'
import { prisma } from '../prisma'
import { logAudit } from '../audit'
import { serviceSchema, type ServiceInput, type ExpenseItem } from '../validations/catalog'

// ─── Serialisable types ───────────────────────────────────────────────────────

export type ServiceListItem = {
  id: string
  name: string
  category: string
  description: string
  defaultScope: string
  unit: string
  engagementTerm: number
  estimatedExpenses: ExpenseItem[]
  defaultRate: string
  isActive: boolean
  internalNotes: string | null
  paymentTplId: string | null
  tcTemplateId: string | null
  paymentTemplateName: string | null
  tcTemplateName: string | null
  createdAt: string
  updatedAt: string
}

export type ServiceDetail = ServiceListItem

export type AuditEntry = {
  id: string
  action: string
  actorId: string
  actorName: string
  diffJson: unknown
  createdAt: string
}

export type TemplateOption = { id: string; name: string }

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getServices(): Promise<ServiceListItem[]> {
  const services = await prisma.service.findMany({
    include: {
      paymentTemplate: { select: { name: true } },
      tcTemplate: { select: { name: true } },
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })
  return services.map(toListItem)
}

export async function getServiceById(id: string): Promise<ServiceDetail | null> {
  const s = await prisma.service.findUnique({
    where: { id },
    include: {
      paymentTemplate: { select: { name: true } },
      tcTemplate: { select: { name: true } },
    },
  })
  if (!s) return null
  return toListItem(s)
}

export async function getServiceAuditLog(serviceId: string): Promise<AuditEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { entityType: 'Service', entityId: serviceId },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    actorId: l.actorId,
    actorName: l.actor.name,
    diffJson: l.diffJson,
    createdAt: l.createdAt.toISOString(),
  }))
}

export async function getExistingCategories(): Promise<string[]> {
  const services = await prisma.service.findMany({
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  })
  return services.map((s) => s.category)
}

export async function getTemplateOptions(): Promise<{
  paymentTemplates: TemplateOption[]
  tcTemplates: TemplateOption[]
}> {
  const [paymentTemplates, tcTemplates] = await Promise.all([
    prisma.paymentTemplate.findMany({
      where: { isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.tCTemplate.findMany({
      where: { isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return { paymentTemplates, tcTemplates }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createService(
  raw: ServiceInput,
): Promise<{ success: true; id: string } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:catalog')) return { error: 'Unauthorized' }

  const parsed = serviceSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const data = parsed.data

  const service = await prisma.service.create({
    data: {
      name: data.name,
      category: data.category,
      description: data.description,
      defaultScope: data.defaultScope,
      unit: data.unit,
      engagementTerm: data.engagementTerm,
      estimatedExpenses: data.estimatedExpenses ?? [],
      defaultRate: data.defaultRate,
      paymentTplId: data.paymentTplId || null,
      tcTemplateId: data.tcTemplateId || null,
      internalNotes: data.internalNotes || null,
      isActive: true,
    },
  })

  await logAudit('Service', service.id, 'created', session.user.id, {
    after: serializeForDiff(service),
  })

  revalidatePath('/catalog')
  return { success: true, id: service.id }
}

export async function updateService(
  serviceId: string,
  raw: ServiceInput,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:catalog')) return { error: 'Unauthorized' }

  const parsed = serviceSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const data = parsed.data

  const before = await prisma.service.findUnique({ where: { id: serviceId } })
  if (!before) return { error: 'Service not found' }

  const updated = await prisma.service.update({
    where: { id: serviceId },
    data: {
      name: data.name,
      category: data.category,
      description: data.description,
      defaultScope: data.defaultScope,
      unit: data.unit,
      engagementTerm: data.engagementTerm,
      estimatedExpenses: data.estimatedExpenses ?? [],
      defaultRate: data.defaultRate,
      paymentTplId: data.paymentTplId || null,
      tcTemplateId: data.tcTemplateId || null,
      internalNotes: data.internalNotes || null,
    },
  })

  await logAudit('Service', serviceId, 'updated', session.user.id, {
    before: serializeForDiff(before),
    after: serializeForDiff(updated),
  })

  revalidatePath('/catalog')
  revalidatePath(`/catalog/${serviceId}`)
  return { success: true }
}

export async function archiveService(
  serviceId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:catalog')) return { error: 'Unauthorized' }

  const before = await prisma.service.findUnique({ where: { id: serviceId } })
  if (!before) return { error: 'Service not found' }
  if (!before.isActive) return { error: 'Service is already archived' }

  await prisma.service.update({
    where: { id: serviceId },
    data: { isActive: false },
  })

  await logAudit('Service', serviceId, 'archived', session.user.id)

  revalidatePath('/catalog')
  revalidatePath(`/catalog/${serviceId}`)
  return { success: true }
}

export async function restoreService(
  serviceId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:catalog')) return { error: 'Unauthorized' }

  const before = await prisma.service.findUnique({ where: { id: serviceId } })
  if (!before) return { error: 'Service not found' }
  if (before.isActive) return { error: 'Service is already active' }

  await prisma.service.update({
    where: { id: serviceId },
    data: { isActive: true },
  })

  await logAudit('Service', serviceId, 'restored', session.user.id)

  revalidatePath('/catalog')
  revalidatePath(`/catalog/${serviceId}`)
  return { success: true }
}

export async function bulkRestoreServices(
  serviceIds: string[],
): Promise<{ success: true; count: number } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:catalog')) return { error: 'Unauthorized' }
  if (serviceIds.length === 0) return { error: 'No services selected' }

  await prisma.service.updateMany({
    where: { id: { in: serviceIds }, isActive: false },
    data: { isActive: true },
  })

  await Promise.all(
    serviceIds.map((id) => logAudit('Service', id, 'restored', session.user.id)),
  )

  revalidatePath('/catalog')
  return { success: true, count: serviceIds.length }
}

/**
 * Checks which names from the given list already exist as active services (case-insensitive).
 * Also returns names that match archived services (for warnings).
 */
export async function checkDuplicateServiceNames(names: string[]): Promise<{
  activeNames: string[]
  archivedNames: string[]
}> {
  const session = await getSession()
  if (!session) return { activeNames: [], archivedNames: [] }
  if (!can(session.user, 'manage:catalog')) return { activeNames: [], archivedNames: [] }

  const lower = names.map((n) => n.toLowerCase())

  const existing = await prisma.service.findMany({
    where: { name: { in: names, mode: 'insensitive' } },
    select: { name: true, isActive: true },
  })

  const activeNames: string[] = []
  const archivedNames: string[] = []

  for (const svc of existing) {
    const lName = svc.name.toLowerCase()
    if (lower.includes(lName)) {
      if (svc.isActive) activeNames.push(lName)
      else archivedNames.push(lName)
    }
  }

  return { activeNames, archivedNames }
}

export async function bulkArchiveServices(
  serviceIds: string[],
): Promise<{ success: true; count: number } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:catalog')) return { error: 'Unauthorized' }
  if (serviceIds.length === 0) return { error: 'No services selected' }

  await prisma.service.updateMany({
    where: { id: { in: serviceIds }, isActive: true },
    data: { isActive: false },
  })

  await Promise.all(
    serviceIds.map((id) => logAudit('Service', id, 'archived', session.user.id)),
  )

  revalidatePath('/catalog')
  return { success: true, count: serviceIds.length }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toListItem(s: {
  id: string
  name: string
  category: string
  description: string
  defaultScope: string
  unit: string
  engagementTerm: number
  estimatedExpenses: unknown
  defaultRate: unknown
  isActive: boolean
  internalNotes: string | null
  paymentTplId: string | null
  tcTemplateId: string | null
  paymentTemplate?: { name: string } | null
  tcTemplate?: { name: string } | null
  createdAt: Date
  updatedAt: Date
}): ServiceListItem {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    defaultScope: s.defaultScope,
    unit: s.unit,
    engagementTerm: s.engagementTerm,
    estimatedExpenses: parseExpenses(s.estimatedExpenses),
    defaultRate: String(s.defaultRate),
    isActive: s.isActive,
    internalNotes: s.internalNotes,
    paymentTplId: s.paymentTplId,
    tcTemplateId: s.tcTemplateId,
    paymentTemplateName: s.paymentTemplate?.name ?? null,
    tcTemplateName: s.tcTemplate?.name ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

function parseExpenses(raw: unknown): ExpenseItem[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((e) => {
    if (e && typeof e === 'object' && 'label' in e && 'amount' in e) {
      const item = e as { label: unknown; amount: unknown }
      return [{ label: String(item.label), amount: Number(item.amount) }]
    }
    return []
  })
}

function serializeForDiff(s: Record<string, unknown>) {
  return {
    name: s.name,
    category: s.category,
    description: s.description,
    unit: s.unit,
    engagementTerm: s.engagementTerm != null ? String(s.engagementTerm) : null,
    estimatedExpenses: JSON.stringify(parseExpenses(s.estimatedExpenses)),
    defaultRate: String(s.defaultRate),
    paymentTplId: s.paymentTplId,
    tcTemplateId: s.tcTemplateId,
    internalNotes: s.internalNotes,
  }
}
