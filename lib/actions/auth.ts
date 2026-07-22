'use server'

import { createClient } from '@/utils/supabase/server'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '../prisma'
import { getSession } from '../auth'
import { logAudit } from '../audit'
import { changeOwnPasswordSchema, type ChangeOwnPasswordInput } from '../validations/profile'
import { requestPasswordResetSchema } from '../validations/auth'
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

/**
 * Step 1 of the unauthenticated "forgot password" flow. Sends a Supabase Auth
 * recovery email whose link lands on /auth/callback?next=/reset-password (the
 * callback exchanges the token for a short-lived session, then the user sets a
 * new password on /reset-password).
 *
 * This ALWAYS resolves to { success: true } regardless of whether the email is
 * registered, is malformed, or is rate-limited — so the response can never be
 * used to enumerate which emails have accounts. resetPasswordForEmail itself is
 * already a no-op for unknown addresses; we mirror that with uniform timing and
 * output on our side.
 */
export async function requestPasswordReset(email: string): Promise<{ success: true }> {
  const normalized = email.trim().toLowerCase()

  const parsed = requestPasswordResetSchema.safeParse({ email: normalized })
  if (!parsed.success) return { success: true }

  // Throttle to blunt email-bombing: max 3 links per 15 min per email+IP.
  const h = headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = rateLimit(`pwreset:${normalized}:${ip}`, 3, 15 * 60 * 1000)
  if (!limit.ok) return { success: true }

  // resetPasswordForEmail needs an absolute redirect that is on the Supabase
  // Auth "Redirect URLs" allowlist. Prefer the configured app URL; fall back to
  // the request origin/host for preview deployments.
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    h.get('origin') ||
    (h.get('host') ? `https://${h.get('host')}` : '')

  const supabase = makeSupabaseServerClient()
  await supabase.auth.resetPasswordForEmail(normalized, {
    redirectTo: `${base}/auth/callback?next=/reset-password`,
  })
  // Ignore any error on purpose — never leak whether the address exists.

  return { success: true }
}

/**
 * Step 2 of the "forgot password" flow. Runs on /reset-password, where the user
 * arrives holding a short-lived recovery session minted by /auth/callback.
 * Updates the password on that session, records an audit entry, then signs the
 * recovery session out so the user must log in fresh with the new credential.
 *
 * Reuses changeOwnPasswordSchema for identical password rules, and gates on
 * getSession() so a deactivated/soft-deleted account can never complete a reset
 * even if it somehow reached this step.
 */
export async function resetPassword(
  raw: ChangeOwnPasswordInput,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) {
    return { error: 'Your reset link is invalid or has expired. Request a new one.' }
  }

  const parsed = changeOwnPasswordSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = makeSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword })

  if (error) {
    return { error: error.message }
  }

  await logAudit('User', session.user.id, 'reset_password', session.user.id)

  // Drop the recovery session so the new password is the only way back in.
  await supabase.auth.signOut()

  return { success: true }
}
