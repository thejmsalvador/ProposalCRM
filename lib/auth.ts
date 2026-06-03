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
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user?.email) return null

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (!user || !user.isActive) return null

  return {
    supabaseId: session.user.id,
    user: user as UserModel,
    role: user.role as UserModel['role'],
  }
}
