import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Handles the OAuth / magic-link callback from Supabase.
 * Exchanges the code for a session, sets the auth cookies,
 * then redirects to the app.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/app/dashboard'

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
