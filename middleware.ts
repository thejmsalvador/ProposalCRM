import { createClient } from '@/utils/supabase/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/auth/callback', '/pdf/']

export async function middleware(req: NextRequest) {
  const { supabase, supabaseResponse } = createClient(req)

  // Refresh the session — must be awaited before any redirect/response logic
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { pathname } = req.nextUrl

  // Public paths are always allowed through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return supabaseResponse
  }

  // Redirect unauthenticated users to /login
  if (!session) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  // Run on all routes except Next.js internals and static assets.
  // Public routes (/login, /auth/callback) are allowed through inside the middleware.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
