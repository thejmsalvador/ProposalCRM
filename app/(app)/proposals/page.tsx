import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getProposals } from '@/lib/actions/proposals'
import { prisma } from '@/lib/prisma'
import { ProposalsClient } from './ProposalsClient'

export default async function ProposalsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [proposals, salespeople] = await Promise.all([
    getProposals(),
    // Salespeople dropdown visible to MANAGER+
    session.user.role === 'SALES_EXEC'
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
  ])

  return (
    <ProposalsClient
      proposals={proposals}
      salespeople={salespeople}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    />
  )
}
