import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'
import {
  getProposalsPage,
  getKanbanBoard,
  type ProposalListQuery,
  type ProposalSortField,
} from '@/lib/actions/proposals'
import { prisma } from '@/lib/prisma'
import { ProposalsClient } from './ProposalsClient'

const SORT_FIELDS: ProposalSortField[] = [
  'number', 'clientName', 'projectTitle', 'total', 'status',
  'createdBy', 'createdAt', 'updatedAt', 'version',
]

type SearchParams = { [key: string]: string | string[] | undefined }

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const param = (key: string): string | undefined => {
    const value = searchParams[key]
    return typeof value === 'string' && value !== '' ? value : undefined
  }

  // URL param wins; cookie remembers the last toggle for bare /proposals visits
  const viewParam = param('view')
  const cookieView = cookies().get('proposals_view')?.value
  const view: 'list' | 'kanban' =
    viewParam === 'kanban' || (!viewParam && cookieView === 'kanban') ? 'kanban' : 'list'

  const sortParam = param('sort')
  const pageParam = parseInt(param('page') ?? '1', 10)

  const query: ProposalListQuery = {
    q: param('q'),
    statuses: param('status')?.split(',').filter(Boolean),
    dateFrom: param('from'),
    dateTo: param('to'),
    salespersonId: param('sp'),
    sort: SORT_FIELDS.includes(sortParam as ProposalSortField)
      ? (sortParam as ProposalSortField)
      : undefined,
    dir: param('dir') === 'asc' ? 'asc' : param('dir') === 'desc' ? 'desc' : undefined,
    page: Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1,
  }

  const [listData, kanbanColumns, salespeople] = await Promise.all([
    view === 'list' ? getProposalsPage(query) : Promise.resolve(null),
    view === 'kanban' ? getKanbanBoard(query) : Promise.resolve(null),
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
      view={view}
      listData={listData}
      kanbanColumns={kanbanColumns}
      salespeople={salespeople}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
      initialQuery={{
        q: query.q ?? '',
        statuses: query.statuses ?? null,
        dateFrom: query.dateFrom ?? '',
        dateTo: query.dateTo ?? '',
        salespersonId: query.salespersonId ?? 'all',
        sort: query.sort ?? 'updatedAt',
        dir: query.dir ?? 'desc',
      }}
    />
  )
}
