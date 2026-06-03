'use server'

import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '../prisma'

function makeSupabaseServerClient() {
  return createClient(cookies())
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ error: string } | never> {
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
