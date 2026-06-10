'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getSession } from '../auth'
import { prisma } from '../prisma'
import { logAudit } from '../audit'
import { systemSettingsSchema, type SystemSettingsInput } from '../validations/settings'

export async function updateSystemSettings(
  input: SystemSettingsInput,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }
  if (session.user.role !== 'SUPER_ADMIN') return { error: 'Unauthorized' }

  const parsed = systemSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const data = {
    agencyName: parsed.data.agencyName.trim(),
    agencyLogoUrl: parsed.data.agencyLogoUrl.trim() || null,
    brandColorHex: parsed.data.brandColorHex.toUpperCase(),
    defaultValidityDays: parsed.data.defaultValidityDays,
    defaultCurrency: parsed.data.defaultCurrency.toUpperCase(),
    defaultVatRate: parsed.data.defaultVatRate,
  }

  const existing = await prisma.systemSettings.findFirst()
  const saved = existing
    ? await prisma.systemSettings.update({ where: { id: existing.id }, data })
    : await prisma.systemSettings.create({ data })

  await logAudit('SystemSettings', saved.id, 'updated', session.user.id, data)

  // App shell and login page read settings through the tagged cache
  revalidateTag('system-settings')
  revalidatePath('/settings')

  return { success: true }
}
