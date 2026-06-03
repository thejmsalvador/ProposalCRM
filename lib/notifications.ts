import { prisma } from './prisma'

/**
 * Creates an in-app notification for a user.
 */
export async function createNotification(
  userId: string,
  message: string,
  link?: string,
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId,
      message,
      link: link ?? null,
    },
  })
}
