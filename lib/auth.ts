import { createServerClient } from '@supabase/auth-helpers-nextjs'
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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // setAll is called from Server Components where cookies are read-only;
            // the middleware handles refreshing, so this is safe to ignore.
          }
        },
      },
    },
  )

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
