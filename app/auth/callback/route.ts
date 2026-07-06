import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Handles the OAuth / magic-link callback from Supabase.
 * Exchanges the code for a session, sets the auth cookies,
 * then redirects to the app.
 */
// Only allow same-origin, single-leading-slash paths as redirect targets, so a
// crafted ?next= cannot bounce the user to an external site or a protocol-
// relative URL after login.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/dashboard'
  }
  return raw
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = createClient(cookies())

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — redirect to login with an error flag
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
