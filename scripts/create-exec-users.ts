/**
 * One-off: create login-capable COO and CEO users (Supabase Auth + Prisma row).
 * Idempotent — safe to re-run. Run with: npx tsx scripts/create-exec-users.ts
 */
// Run from the repo root. .env holds DATABASE_URL + service-role key; .env.local
// holds the correct project URL (the NEXT_PUBLIC_SUPABASE_URL in .env is stale —
// see memory). Load both, and let the .env.local URL win.
import { readFileSync } from 'fs'
import { resolve } from 'path'

process.loadEnvFile(resolve(process.cwd(), '.env'))
const localUrl = (() => {
  try {
    const txt = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    const m = txt.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined
  } catch {
    return undefined
  }
})()
if (localUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = localUrl

import { createClient } from '@supabase/supabase-js'

// Passwords are read from the environment, never hardcoded. Set these before
// running (e.g. in .env.local): COO_INITIAL_PASSWORD, CEO_INITIAL_PASSWORD.
// The script never prints passwords to stdout.
const EXECS = [
  { name: 'Olivia COO', email: 'coo@agency.com', passwordEnv: 'COO_INITIAL_PASSWORD', role: 'COO', jobTitle: 'Chief Operating Officer' },
  { name: 'Ethan CEO', email: 'ceo@agency.com', passwordEnv: 'CEO_INITIAL_PASSWORD', role: 'CEO', jobTitle: 'Chief Executive Officer' },
] as const

async function main() {
  const { prisma } = await import('../lib/prisma')

  // Fail closed if any required password env var is missing/weak.
  const missing = EXECS.filter((u) => {
    const pw = process.env[u.passwordEnv]
    return !pw || pw.length < 12
  })
  if (missing.length > 0) {
    throw new Error(
      `Set a strong (≥12 char) password for each exec via env before running: ` +
        missing.map((u) => u.passwordEnv).join(', '),
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  for (const u of EXECS) {
    // 1) Supabase Auth user (with password so they can log in immediately)
    const { error: authErr } = await supabase.auth.admin.createUser({
      email: u.email,
      password: process.env[u.passwordEnv]!,
      email_confirm: true,
      user_metadata: { name: u.name },
    })
    if (authErr && !/already.*registered|already exists/i.test(authErr.message)) {
      throw new Error(`Auth create failed for ${u.email}: ${authErr.message}`)
    }
    const authNote = authErr ? '(auth user already existed)' : '(auth user created)'

    // 2) Prisma row — match by email so app role-sync resolves it
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role as never, name: u.name, jobTitle: u.jobTitle, isActive: true },
      create: {
        name: u.name,
        email: u.email,
        role: u.role as never,
        jobTitle: u.jobTitle,
        isActive: true,
      },
    })
    // Never print the password.
    console.log(`✓ ${u.role}: ${u.email}  ${authNote}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
