'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  markNotificationRead,
  markAllRead,
  type NotificationItem,
} from '@/lib/actions/notifications'

type Props = {
  userId: string
  initialNotifications: NotificationItem[]
  initialUnreadCount: number
}

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NotificationBell({ userId, initialNotifications, initialUnreadCount }: Props) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [isPending, startTransition] = useTransition()

  const handleClickNotification = (notification: NotificationItem) => {
    if (!notification.isRead) {
      startTransition(async () => {
        await markNotificationRead(notification.id)
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
        )
        setUnreadCount((c) => Math.max(0, c - 1))
      })
    }
    if (notification.link) {
      router.push(notification.link)
    }
  }

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllRead(userId)
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      setUnreadCount(0)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative p-2 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface)] transition-colors"
          aria-label="Notifications"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-primary)]">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">
              No notifications yet.
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClickNotification(n)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface)] transition-colors',
                  !n.isRead && 'bg-[var(--color-accent-light)]',
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-[var(--color-accent)] shrink-0" />
                  )}
                  <div className={cn('flex-1 min-w-0', n.isRead && 'pl-4')}>
                    <p className="text-sm text-[var(--color-primary)] leading-snug line-clamp-2">
                      {n.message}
                    </p>
                    <p className="text-xs text-[var(--color-muted)] mt-0.5">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
