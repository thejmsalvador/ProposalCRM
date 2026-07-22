import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

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
  // Recovery/magic-link emails can also arrive as a token_hash + type pair when
  // the Supabase email template is switched to {{ .TokenHash }}; verifyOtp
  // handles those without needing the PKCE code verifier. Support both so the
  // flow works regardless of which template the project uses.
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = safeNext(searchParams.get('next'))

  const supabase = createClient(cookies())

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong. Bounce recovery failures back to the reset-request
  // screen (a stale/reused link) and everything else to login.
  const failTarget =
    type === 'recovery' || next === '/reset-password'
      ? '/forgot-password?error=link_invalid'
      : '/login?error=auth_callback_failed'
  return NextResponse.redirect(`${origin}${failTarget}`)
}
