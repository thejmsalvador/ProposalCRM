'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '../auth'
import { can } from '../permissions'
import { prisma } from '../prisma'
import { logAudit } from '../audit'
import { modeOfPaymentSchema, type ModeOfPaymentInput } from '../validations/mode-of-payment'

// ─── Serialisable types ───────────────────────────────────────────────────────

export type ModeOfPaymentListItem = {
  id: string
  label: string
  bankName: string
  accountName: string
  accountNumber: string
  branch: string
  swiftCode: string
  sortOrder: number
  isDefault: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getModesOfPayment(): Promise<ModeOfPaymentListItem[]> {
  // Internal bank-account details — require an authenticated session before
  // returning them. Available to all signed-in staff (used across the wizard).
  const session = await getSession()
  if (!session) return []
  const modes = await prisma.modeOfPayment.findMany({
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  })
  return modes.map(toListItem)
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createModeOfPayment(
  raw: ModeOfPaymentInput,
): Promise<{ success: true; id: string } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const parsed = modeOfPaymentSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const data = parsed.data

  // New rows go to the end of the library order.
  const last = await prisma.modeOfPayment.findFirst({ orderBy: { sortOrder: 'desc' } })
  const nextSortOrder = (last?.sortOrder ?? -1) + 1

  const mode = await prisma.modeOfPayment.create({
    data: {
      label: data.label,
      bankName: data.bankName,
      accountName: data.accountName,
      accountNumber: data.accountNumber,
      branch: data.branch || null,
      swiftCode: data.swiftCode || null,
      sortOrder: nextSortOrder,
    },
  })

  await logAudit('ModeOfPayment', mode.id, 'created', session.user.id, {
    after: { label: mode.label, bankName: mode.bankName },
  })

  revalidatePath('/mode-of-payment')
  return { success: true, id: mode.id }
}

export async function updateModeOfPayment(
  modeId: string,
  raw: ModeOfPaymentInput,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const parsed = modeOfPaymentSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const data = parsed.data

  const before = await prisma.modeOfPayment.findUnique({ where: { id: modeId } })
  if (!before) return { error: 'Mode of payment not found' }

  const updated = await prisma.modeOfPayment.update({
    where: { id: modeId },
    data: {
      label: data.label,
      bankName: data.bankName,
      accountName: data.accountName,
      accountNumber: data.accountNumber,
      branch: data.branch || null,
      swiftCode: data.swiftCode || null,
    },
  })

  await logAudit('ModeOfPayment', modeId, 'updated', session.user.id, {
    before: { label: before.label, bankName: before.bankName },
    after: { label: updated.label, bankName: updated.bankName },
  })

  revalidatePath('/mode-of-payment')
  return { success: true }
}

export async function archiveModeOfPayment(
  modeId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const mode = await prisma.modeOfPayment.findUnique({ where: { id: modeId } })
  if (!mode) return { error: 'Mode of payment not found' }
  if (mode.isArchived) return { error: 'Mode of payment is already archived' }

  await prisma.modeOfPayment.update({
    where: { id: modeId },
    data: { isArchived: true },
  })

  await logAudit('ModeOfPayment', modeId, 'archived', session.user.id)

  revalidatePath('/mode-of-payment')
  return { success: true }
}

export async function restoreModeOfPayment(
  modeId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const mode = await prisma.modeOfPayment.findUnique({ where: { id: modeId } })
  if (!mode) return { error: 'Mode of payment not found' }
  if (!mode.isArchived) return { error: 'Mode of payment is not archived' }

  await prisma.modeOfPayment.update({
    where: { id: modeId },
    data: { isArchived: false },
  })

  await logAudit('ModeOfPayment', modeId, 'restored', session.user.id)

  revalidatePath('/mode-of-payment')
  return { success: true }
}

// Set (or clear) the library's single default bank account. Passing an id makes
// that account the sole default; the previous default is cleared atomically.
export async function setDefaultModeOfPayment(
  modeId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'manage:templates')) return { error: 'Unauthorized' }

  const mode = await prisma.modeOfPayment.findUnique({ where: { id: modeId } })
  if (!mode) return { error: 'Mode of payment not found' }
  if (mode.isArchived) return { error: 'Cannot set an archived account as default' }

  const makeDefault = !mode.isDefault
  await prisma.$transaction([
    prisma.modeOfPayment.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    ...(makeDefault
      ? [prisma.modeOfPayment.update({ where: { id: modeId }, data: { isDefault: true } })]
      : []),
  ])

  await logAudit('ModeOfPayment', modeId, makeDefault ? 'set_default' : 'unset_default', session.user.id)
  revalidatePath('/mode-of-payment')
  return { success: true }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toListItem(m: {
  id: string
  label: string
  bankName: string
  accountName: string
  accountNumber: string
  branch: string | null
  swiftCode: string | null
  sortOrder: number
  isDefault: boolean
  isArchived: boolean
  createdAt: Date
  updatedAt: Date
}): ModeOfPaymentListItem {
  return {
    id: m.id,
    label: m.label,
    bankName: m.bankName,
    accountName: m.accountName,
    accountNumber: m.accountNumber,
    branch: m.branch ?? '',
    swiftCode: m.swiftCode ?? '',
    sortOrder: m.sortOrder,
    isDefault: m.isDefault,
    isArchived: m.isArchived,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }
}
