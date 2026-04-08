import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getWizardData } from '@/lib/actions/proposals'
import { WizardClient } from './WizardClient'

export default async function NewProposalPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.user, 'create:proposal')) redirect('/dashboard')

  const { approvers, services, paymentTemplates, tcTemplates, systemSettings } =
    await getWizardData()

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <WizardClient
        services={services}
        approvers={approvers}
        paymentTemplates={paymentTemplates}
        tcTemplates={tcTemplates}
        systemSettings={systemSettings}
        currentUser={{
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          role: session.user.role,
        }}
      />
    </div>
  )
}
