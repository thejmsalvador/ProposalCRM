import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getUnreadCount } from '@/lib/actions/notifications'
import { getCachedSystemSettings } from '@/lib/queries/settings'
import { AppShell } from '@/components/shell/AppShell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const [unreadCount, settings] = await Promise.all([
    getUnreadCount(session.user.id),
    getCachedSystemSettings(),
  ])

  return (
    <AppShell
      user={session.user}
      unreadCount={unreadCount}
      agencyName={settings?.agencyName ?? 'Sunday Studio'}
      agencyLogoUrl={settings?.agencyLogoUrl ?? null}
    >
      {children}
    </AppShell>
  )
}
