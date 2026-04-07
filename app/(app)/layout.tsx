import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getNotifications, getUnreadCount } from '@/lib/actions/notifications'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/shell/AppShell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const [notifications, unreadCount, settings] = await Promise.all([
    getNotifications(session.user.id),
    getUnreadCount(session.user.id),
    prisma.systemSettings.findFirst(),
  ])

  return (
    <AppShell
      user={session.user}
      notifications={notifications}
      unreadCount={unreadCount}
      agencyName={settings?.agencyName ?? 'ProposalCRM'}
      agencyLogoUrl={settings?.agencyLogoUrl ?? null}
    >
      {children}
    </AppShell>
  )
}
