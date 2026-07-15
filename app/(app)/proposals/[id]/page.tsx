import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { getProposalDetail } from '@/lib/actions/proposals'
import { getAssignableUsers } from '@/lib/actions/activity'
import { Breadcrumbs } from '@/components/shell/Breadcrumbs'
import { ProposalDetailClient } from './ProposalDetailClient'

type Props = {
  params: { id: string }
}

export default async function ProposalDetailPage({ params }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')

  const proposal = await getProposalDetail(params.id)
  if (!proposal) notFound()

  // Task-assignee options for the activity feed (users who can view this proposal)
  const assignableUsers = await getAssignableUsers(params.id)

  // Proposals store the client name as a point-in-time snapshot. If the linked
  // Client record has since been renamed, surface a subtle staleness note
  // (never auto-rewrite historical proposals). Light query — id + name only.
  const linkedClient = await prisma.proposal
    .findUnique({
      where: { id: params.id },
      select: { client: { select: { id: true, companyName: true } } },
    })
    .then((p) => p?.client ?? null)
  const clientUpdate =
    linkedClient && linkedClient.companyName !== proposal.clientName
      ? { clientId: linkedClient.id, currentName: linkedClient.companyName }
      : null

  const canEdit =
    (proposal.status === 'DRAFT' || proposal.status === 'REVISION_REQUIRED') &&
    (proposal.createdBy.id === session.user.id || can(session.user, 'edit:any_proposal'))

  const canApprove = can(session.user, 'approve:proposal')
  const canForceOverride = session.user.role === 'SUPER_ADMIN'

  return (
    <>
      <div className="px-6 pt-4">
        <Breadcrumbs
          items={[
            { label: 'Proposals', href: '/proposals' },
            { label: proposal.number },
          ]}
        />
      </div>
      <ProposalDetailClient
        proposal={proposal}
        currentUser={{ id: session.user.id, role: session.user.role }}
        assignableUsers={assignableUsers}
        canEdit={canEdit}
        canApprove={canApprove}
        canForceOverride={canForceOverride}
        clientUpdate={clientUpdate}
      />
    </>
  )
}
