import { getCachedSystemSettings } from '@/lib/queries/settings'
import { LoginForm } from './LoginForm'

// Reads SystemSettings (agency name) from the DB, so render at request time
// rather than prerendering at build — the build must not require a database.
export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { reset?: string; error?: string }
}) {
  const settings = await getCachedSystemSettings()
  const agencyName = settings?.agencyName ?? 'ProposalCRM'

  const notice =
    searchParams.reset === 'success'
      ? {
          type: 'success' as const,
          text: 'Your password has been reset. Sign in with your new password.',
        }
      : searchParams.error === 'auth_callback_failed'
        ? {
            type: 'error' as const,
            text: 'That sign-in link was invalid or has expired. Please try again.',
          }
        : null

  return <LoginForm agencyName={agencyName} notice={notice} />
}
