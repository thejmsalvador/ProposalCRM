'use server'

import { prisma } from '../prisma'
import { revalidatePath } from 'next/cache'

export type NotificationItem = {
  id: string
  message: string
  link: string | null
  isRead: boolean
  createdAt: Date
}

export async function getNotifications(userId: string): Promise<NotificationItem[]> {
  return prisma.notification.findMany({
    where: { userId },
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

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false },
  })
}

export async function markNotificationRead(id: string): Promise<void> {
  await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  })
  revalidatePath('/', 'layout')
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  })
  revalidatePath('/', 'layout')
}
