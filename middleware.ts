import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/pdf/',
]

// Edge-safe auth gate.
//
// We deliberately do NOT instantiate a Supabase client here: @supabase/ssr's
// createServerClient pulls modules that Vercel's Edge runtime validator rejects
// at deploy time. Instead we do a cheap presence check on the Supabase auth
// cookie to redirect obviously-unauthenticated requests early.
//
// Real session validation (and the redirect to /login for invalid/expired
// sessions) happens server-side in getSession(), which the (app) layout
// enforces on every authenticated page in the Node runtime where the full
// Supabase client works.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public paths are always allowed through.
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Supabase (via @supabase/ssr) stores the session in cookies named
  // `sb-<project-ref>-auth-token`, optionally chunked with a `.0`/`.1` suffix.
  const hasAuthCookie = req.cookies
    .getAll()
    .some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name) && c.value)

  if (!hasAuthCookie) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  // Run on all routes except Next.js internals and static assets.
  // Public routes (/login, /auth/callback, /pdf/) are allowed through above.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
