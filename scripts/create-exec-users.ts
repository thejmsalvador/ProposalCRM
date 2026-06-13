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

const EXECS = [
  { name: 'Olivia COO', email: 'coo@agency.com', password: 'Coo1234!', role: 'COO', jobTitle: 'Chief Operating Officer' },
  { name: 'Ethan CEO', email: 'ceo@agency.com', password: 'Ceo1234!', role: 'CEO', jobTitle: 'Chief Executive Officer' },
] as const

async function main() {
  const { prisma } = await import('../lib/prisma')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  for (const u of EXECS) {
    // 1) Supabase Auth user (with password so they can log in immediately)
    const { error: authErr } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
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
    console.log(`✓ ${u.role}: ${u.email} / ${u.password}  ${authNote}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
