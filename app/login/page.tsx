import { getCachedSystemSettings } from '@/lib/queries/settings'
import { LoginForm } from './LoginForm'

// Reads SystemSettings (agency name) from the DB, so render at request time
// rather than prerendering at build — the build must not require a database.
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const settings = await getCachedSystemSettings()
  const agencyName = settings?.agencyName ?? 'ProposalCRM'

  return <LoginForm agencyName={agencyName} />
}
