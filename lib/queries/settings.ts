import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'

/**
 * SystemSettings changes rarely; cache it across requests for 5 minutes.
 * Mutations must call revalidateTag('system-settings') for instant propagation.
 */
export const getCachedSystemSettings = unstable_cache(
  () => prisma.systemSettings.findFirst(),
  ['system-settings'],
  { revalidate: 300, tags: ['system-settings'] },
)
