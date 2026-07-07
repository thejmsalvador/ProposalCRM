import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { prisma } from './prisma'
import type { UserModel } from './generated/prisma/models/User'

export type SessionUser = {
  supabaseId: string
  user: UserModel
  role: UserModel['role']
}

/**
 * Returns the current session and the matching Prisma User.
 * Must be called from a Server Component, Route Handler, or Server Action.
 * Returns null if unauthenticated or if no matching Prisma User exists.
 * Memoized per request via React cache() so multiple callers in the same render
 * tree only pay the Supabase + DB cost once.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = cookies()
  const supabase = createClient(cookieStore)

  // Use getUser() rather than getSession(): getUser() revalidates the token
  // against the Supabase Auth server, whereas getSession() only decodes the
  // cookie contents without verifying them.
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser?.email) return null

  const user = await prisma.user.findUnique({
    where: { email: authUser.email },
  })

  if (!user || !user.isActive) return null

  return {
    supabaseId: authUser.id,
    user: user as UserModel,
    role: user.role as UserModel['role'],
  }
})
