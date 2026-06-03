import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getWizardData, getProposalForEdit } from '@/lib/actions/proposals'
import { WizardClient } from '../../new/WizardClient'

type Props = {
  params: { id: string }
}

export default async function EditProposalPage({ params }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.user, 'create:proposal') && !can(session.user, 'edit:any_proposal')) {
    redirect('/proposals')
  }

  const [editResult, wizardData] = await Promise.all([
    getProposalForEdit(params.id),
    getWizardData(),
  ])

  if ('error' in editResult) notFound()

  const { proposalId, proposalNumber, formData } = editResult.data

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <WizardClient
        services={wizardData.services}
        approvers={wizardData.approvers}
        paymentTemplates={wizardData.paymentTemplates}
        tcTemplates={wizardData.tcTemplates}
        systemSettings={wizardData.systemSettings}
        currentUser={{
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          role: session.user.role,
        }}
        initialValues={formData}
        initialProposalId={proposalId}
        initialProposalNumber={proposalNumber}
      />
    </div>
  )
}
