'use server'

import { prisma } from '../prisma'
import { getSession } from '../auth'
import { revalidatePath } from 'next/cache'

export type NotificationItem = {
  id: string
  message: string
  link: string | null
  isRead: boolean
  createdAt: Date
}

export async function getNotifications(): Promise<NotificationItem[]> {
  const session = await getSession()
  if (!session) return []
  return prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      message: true,
      link: true,
      isRead: true,
      createdAt: true,
    },
  })
}

export async function getAllNotifications(): Promise<NotificationItem[]> {
  const session = await getSession()
  if (!session) return []
  return prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      message: true,
      link: true,
      isRead: true,
      createdAt: true,
    },
  })
}

export async function getUnreadCount(): Promise<number> {
  const session = await getSession()
  if (!session) return 0
  return prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  })
}

export async function markNotificationRead(id: string): Promise<void> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  // Ownership check: only update if the notification belongs to the caller.
  const result = await prisma.notification.updateMany({
    where: { id, userId: session.user.id },
    data: { isRead: true },
  })
  if (result.count === 0) throw new Error('Notification not found')
  revalidatePath('/', 'layout')
}

export async function markAllRead(): Promise<void> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  })
  revalidatePath('/', 'layout')
}
