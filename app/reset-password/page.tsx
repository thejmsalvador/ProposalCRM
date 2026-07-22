import Link from 'next/link'
import { getCachedSystemSettings } from '@/lib/queries/settings'
import { getSession } from '@/lib/auth'
import { DEFAULT_AGENCY_NAME } from '@/lib/branding'
import { ResetPasswordForm } from './ResetPasswordForm'

// Depends on the request's auth cookies (the recovery session), so it must never
// be prerendered.
export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage() {
  const [settings, session] = await Promise.all([getCachedSystemSettings(), getSession()])
  const agencyName = settings?.agencyName ?? DEFAULT_AGENCY_NAME

  // This page is only reachable with a live session that /auth/callback minted
  // from the emailed recovery token. No session means the link was invalid,
  // already used, expired, or opened on a different device/browser — or the
  // account is deactivated (getSession() rejects those).
  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              {agencyName}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Reset link expired
            </h1>
          </div>
          <div className="space-y-5 rounded-xl border bg-white p-8 shadow-sm">
            <p className="text-sm text-muted-foreground">
              This password reset link is invalid or has expired. Reset links are
              single-use and must be opened on the same device and browser you
              requested them from.
            </p>
            <Link
              href="/forgot-password"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-[var(--color-accent)] px-4 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
            >
              Request a new link
            </Link>
            <p className="text-center text-sm">
              <Link
                href="/login"
                className="font-medium text-[var(--color-accent)] hover:underline"
              >
                Back to sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return <ResetPasswordForm agencyName={agencyName} />
}
