import { prisma } from '@/lib/prisma'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const settings = await prisma.systemSettings.findFirst()
  const agencyName = settings?.agencyName ?? 'ProposalCRM'

  return <LoginForm agencyName={agencyName} />
}
