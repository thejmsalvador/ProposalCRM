import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProposalDetail } from '@/lib/actions/proposals'
import { ProposalDetailClient } from './ProposalDetailClient'

type Props = {
  params: { id: string }
}

export default async function ProposalDetailPage({ params }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')

  const proposal = await getProposalDetail(params.id)
  if (!proposal) notFound()

  const canEdit =
    (proposal.status === 'DRAFT' || proposal.status === 'REVISION_REQUIRED') &&
    (proposal.createdBy.id === session.user.id || can(session.user, 'edit:any_proposal'))

  const canApprove = can(session.user, 'approve:proposal')
  const canForceOverride = session.user.role === 'SUPER_ADMIN'

  return (
    <ProposalDetailClient
      proposal={proposal}
      currentUser={{ id: session.user.id, role: session.user.role }}
      canEdit={canEdit}
      canApprove={canApprove}
      canForceOverride={canForceOverride}
    />
  )
}
