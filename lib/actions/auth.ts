'use server'

import { createClient } from '@/utils/supabase/server'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '../prisma'
import { getSession } from '../auth'
import { logAudit } from '../audit'
import { changeOwnPasswordSchema, type ChangeOwnPasswordInput } from '../validations/profile'
import { rateLimit } from '../rate-limit'

function makeSupabaseServerClient() {
  return createClient(cookies())
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ error: string } | never> {
  // Throttle brute-force attempts: max 5 tries per 5 minutes per email+IP.
  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = rateLimit(`login:${email.toLowerCase()}:${ip}`, 5, 5 * 60 * 1000)
  if (!limit.ok) {
    return { error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` }
  }

  const supabase = makeSupabaseServerClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'Invalid email or password.' }
  }

  // Enforce invite-only: user must exist in Prisma and be active
  const prismaUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  })

  if (!prismaUser || !prismaUser.isActive) {
    await supabase.auth.signOut()
    return { error: 'Account not found. Contact your admin.' }
  }

  await prisma.user.update({
    where: { id: prismaUser.id },
    data: { lastLoginAt: new Date() },
  })

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = makeSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}

/**
 * Changes the CALLER'S OWN password via Supabase Auth. Operates on the
 * request-scoped session client (not the admin client), so it can only ever
 * update the currently signed-in user — there is no userId/email parameter.
 */
export async function changeOwnPassword(
  raw: ChangeOwnPasswordInput,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = changeOwnPasswordSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = makeSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword })

  if (error) {
    return { error: error.message }
  }

  await logAudit('User', session.user.id, 'changed_own_password', session.user.id)

  return { success: true }
}
