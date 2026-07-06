import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getWizardData, getProposalForEdit } from '@/lib/actions/proposals'
import { Breadcrumbs } from '@/components/shell/Breadcrumbs'
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
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: 'Proposals', href: '/proposals' },
            { label: proposalNumber ?? 'Proposal', href: `/proposals/${proposalId}` },
            { label: 'Edit' },
          ]}
        />
      </div>
      <WizardClient
        services={wizardData.services}
        paymentTemplates={wizardData.paymentTemplates}
        tcTemplates={wizardData.tcTemplates}
        modesOfPayment={wizardData.modesOfPayment}
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
