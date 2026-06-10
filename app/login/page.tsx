import { getCachedSystemSettings } from '@/lib/queries/settings'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  const settings = await getCachedSystemSettings()
  const agencyName = settings?.agencyName ?? 'ProposalCRM'

  return <LoginForm agencyName={agencyName} />
}
