import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getAllNotifications, getUnreadCount } from '@/lib/actions/notifications'
import { NotificationsClient } from './NotificationsClient'

export const metadata = { title: 'Notifications' }

export default async function NotificationsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [notifications, unreadCount] = await Promise.all([
    getAllNotifications(),
    getUnreadCount(),
  ])

  return (
    <NotificationsClient
      initialNotifications={notifications}
      initialUnreadCount={unreadCount}
    />
  )
}
