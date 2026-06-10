import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard')

  // Read directly (not via the tagged cache) so admins always see fresh values
  const settings = await prisma.systemSettings.findFirst()

  return (
    <SettingsClient
      initial={{
        agencyName: settings?.agencyName ?? '',
        agencyLogoUrl: settings?.agencyLogoUrl ?? '',
        brandColorHex: settings?.brandColorHex ?? '#4F46E5',
        defaultValidityDays: settings?.defaultValidityDays ?? 30,
        defaultCurrency: settings?.defaultCurrency ?? 'PHP',
        defaultVatRate: settings ? Number(settings.defaultVatRate) : 12,
      }}
    />
  )
}
