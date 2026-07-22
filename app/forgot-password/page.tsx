import { getCachedSystemSettings } from '@/lib/queries/settings'
import { DEFAULT_AGENCY_NAME } from '@/lib/branding'
import { ForgotPasswordForm } from './ForgotPasswordForm'

// Reads SystemSettings (agency name) from the DB, so render at request time
// rather than prerendering at build — the build must not require a database.
export const dynamic = 'force-dynamic'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const settings = await getCachedSystemSettings()
  const agencyName = settings?.agencyName ?? DEFAULT_AGENCY_NAME

  const initialError =
    searchParams.error === 'link_invalid'
      ? 'That reset link is no longer valid. Request a new one below.'
      : null

  return <ForgotPasswordForm agencyName={agencyName} initialError={initialError} />
}
