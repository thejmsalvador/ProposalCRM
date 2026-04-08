'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { markNotificationRead, markAllRead, type NotificationItem } from '@/lib/actions/notifications'
import { Button } from '@/components/ui/button'

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

type Props = {
  userId: string
  initialNotifications: NotificationItem[]
  initialUnreadCount: number
}

export function NotificationsClient({ userId, initialNotifications, initialUnreadCount }: Props) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [isPending, startTransition] = useTransition()

  const handleClick = (n: NotificationItem) => {
    if (!n.isRead) {
      startTransition(async () => {
        await markNotificationRead(n.id)
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)))
        setUnreadCount((c) => Math.max(0, c - 1))
      })
    }
    if (n.link) {
      router.push(n.link)
    }
  }

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllRead(userId)
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      setUnreadCount(0)
    })
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-full bg-[var(--color-accent-light)] flex items-center justify-center mb-4">
          <Bell size={24} className="text-[var(--color-accent)]" />
        </div>
        <p className="text-base font-medium text-[var(--color-primary)]">You&apos;re all caught up</p>
        <p className="text-sm text-[var(--color-muted)] mt-1">No notifications yet.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--color-muted)]">
          {unreadCount > 0 ? (
            <span>
              <span className="font-semibold text-[var(--color-primary)]">{unreadCount}</span> unread
            </span>
          ) : (
            'All caught up'
          )}
        </p>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isPending}
            className="text-[var(--color-accent)] hover:text-indigo-700 gap-1.5"
          >
            <CheckCheck size={14} />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Notification list */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)] overflow-hidden">
        {notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => handleClick(n)}
            disabled={isPending}
            className={cn(
              'w-full text-left px-5 py-4 hover:bg-[var(--color-surface)] transition-colors flex items-start gap-3 disabled:opacity-60',
              !n.isRead && 'bg-[var(--color-accent-light)]',
            )}
          >
            {/* Unread dot */}
            <span
              className={cn(
                'mt-1.5 w-2 h-2 rounded-full shrink-0',
                n.isRead ? 'bg-transparent' : 'bg-[var(--color-accent)]',
              )}
              aria-hidden="true"
            />

            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  'text-sm leading-snug',
                  n.isRead ? 'text-[var(--color-muted)]' : 'text-[var(--color-primary)] font-medium',
                )}
              >
                {n.message}
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">{timeAgo(n.createdAt)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
