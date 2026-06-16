'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '../generated/prisma/client'
import { getSession } from '../auth'
import { can } from '../permissions'
import { prisma } from '../prisma'
import { logAudit } from '../audit'
import { paymentTermSchema, type PaymentTermInput } from '../validations/payment-terms'
import { cleanPaymentMilestones } from '../validations/proposals'
import { parsePaymentMilestones } from '../payment-schedule'

// ─── Serialisable types ───────────────────────────────────────────────────────

export type PaymentTermListItem = {
  id: string
  name: string
  bodyRichText: string
  milestones: { label: string; dueDate: string; percent: number }[]
  isDefault: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getPaymentTerms(): Promise<PaymentTermListItem[]> {
  const templates = await prisma.paymentTemplate.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
  return templates.map(toListItem)
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createPaymentTerm(
  raw: PaymentTermInput,
): Promise<{ success: true; id: string } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const parsed = paymentTermSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const data = parsed.data

  if (data.isDefault) {
    await prisma.paymentTemplate.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    })
  }

  const template = await prisma.paymentTemplate.create({
    data: {
      name: data.name,
      bodyRichText: data.bodyRichText,
      milestones: cleanPaymentMilestones(data.milestones) as Prisma.InputJsonValue,
      isDefault: data.isDefault,
    },
  })

  await logAudit('PaymentTemplate', template.id, 'created', session.user.id, {
    after: { name: template.name, isDefault: template.isDefault },
  })

  revalidatePath('/payment-terms')
  return { success: true, id: template.id }
}

export async function updatePaymentTerm(
  templateId: string,
  raw: PaymentTermInput,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const parsed = paymentTermSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const data = parsed.data

  const before = await prisma.paymentTemplate.findUnique({ where: { id: templateId } })
  if (!before) return { error: 'Template not found' }

  if (data.isDefault && !before.isDefault) {
    await prisma.paymentTemplate.updateMany({
      where: { isDefault: true, id: { not: templateId } },
      data: { isDefault: false },
    })
  }

  const updated = await prisma.paymentTemplate.update({
    where: { id: templateId },
    data: {
      name: data.name,
      bodyRichText: data.bodyRichText,
      milestones: cleanPaymentMilestones(data.milestones) as Prisma.InputJsonValue,
      isDefault: data.isDefault,
    },
  })

  await logAudit('PaymentTemplate', templateId, 'updated', session.user.id, {
    before: { name: before.name, isDefault: before.isDefault },
    after: { name: updated.name, isDefault: updated.isDefault },
  })

  revalidatePath('/payment-terms')
  return { success: true }
}

export async function setDefaultPaymentTerm(
  templateId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const template = await prisma.paymentTemplate.findUnique({ where: { id: templateId } })
  if (!template) return { error: 'Template not found' }
  if (template.isArchived) return { error: 'Cannot set an archived template as default' }

  await prisma.paymentTemplate.updateMany({
    where: { isDefault: true },
    data: { isDefault: false },
  })

  await prisma.paymentTemplate.update({
    where: { id: templateId },
    data: { isDefault: true },
  })

  await logAudit('PaymentTemplate', templateId, 'set_default', session.user.id)

  revalidatePath('/payment-terms')
  return { success: true }
}

export async function archivePaymentTerm(
  templateId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const template = await prisma.paymentTemplate.findUnique({ where: { id: templateId } })
  if (!template) return { error: 'Template not found' }
  if (template.isArchived) return { error: 'Template is already archived' }
  if (template.isDefault) return { error: 'Cannot archive the default template. Set another template as default first.' }

  await prisma.paymentTemplate.update({
    where: { id: templateId },
    data: { isArchived: true },
  })

  await logAudit('PaymentTemplate', templateId, 'archived', session.user.id)

  revalidatePath('/payment-terms')
  return { success: true }
}

export async function restorePaymentTerm(
  templateId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const template = await prisma.paymentTemplate.findUnique({ where: { id: templateId } })
  if (!template) return { error: 'Template not found' }
  if (!template.isArchived) return { error: 'Template is not archived' }

  await prisma.paymentTemplate.update({
    where: { id: templateId },
    data: { isArchived: false },
  })

  await logAudit('PaymentTemplate', templateId, 'restored', session.user.id)

  revalidatePath('/payment-terms')
  return { success: true }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toListItem(t: {
  id: string
  name: string
  bodyRichText: string
  milestones: unknown
  isDefault: boolean
  isArchived: boolean
  createdAt: Date
  updatedAt: Date
}): PaymentTermListItem {
  return {
    id: t.id,
    name: t.name,
    bodyRichText: t.bodyRichText,
    milestones: parsePaymentMilestones(t.milestones),
    isDefault: t.isDefault,
    isArchived: t.isArchived,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}
