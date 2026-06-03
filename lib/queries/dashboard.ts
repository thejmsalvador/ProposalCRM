import { prisma } from '@/lib/prisma'

export type RoleFilter = {
  userId: string
  role: string
  teamId: string | null
}

/** Builds a Prisma where clause scoped to what the user can see */
function proposalWhere({ userId, role, teamId }: RoleFilter) {
  if (role === 'SALES_EXEC') return { createdById: userId }
  if (role === 'SALES_MANAGER' && teamId) return { createdBy: { teamId } }
  return {} // ADMIN / SUPER_ADMIN see all
}

// ─── Status counts ────────────────────────────────────────────────────────────

export type StatusCount = { status: string; count: number }

export async function proposalsByStatus(filter: RoleFilter): Promise<StatusCount[]> {
  const groups = await prisma.proposal.groupBy({
    by: ['status'],
    where: proposalWhere(filter),
    _count: { id: true },
  })
  return groups.map(g => ({ status: g.status, count: g._count.id }))
}

// ─── Pipeline value ───────────────────────────────────────────────────────────

export async function pipelineValue(filter: RoleFilter): Promise<number> {
  const result = await prisma.proposal.aggregate({
    where: { ...proposalWhere(filter), status: { in: ['APPROVED', 'SENT'] } },
    _sum: { total: true },
  })
  return Number(result._sum.total ?? 0)
}

// ─── Win rate ─────────────────────────────────────────────────────────────────

export async function winRate(filter: RoleFilter, days: number): Promise<number | null> {
  const since = new Date(Date.now() - days * 86_400_000)
  const base = { ...proposalWhere(filter), updatedAt: { gte: since } }
  const [won, lost] = await Promise.all([
    prisma.proposal.count({ where: { ...base, status: 'WON' } }),
    prisma.proposal.count({ where: { ...base, status: 'LOST' } }),
  ])
  const total = won + lost
  return total === 0 ? null : Math.round((won / total) * 100)
}

// ─── Avg draft-to-sent ────────────────────────────────────────────────────────

export async function avgDraftToSent(filter: RoleFilter): Promise<number | null> {
  const proposals = await prisma.proposal.findMany({
    where: {
      ...proposalWhere(filter),
      status: { in: ['SENT', 'WON', 'LOST', 'EXPIRED'] },
    },
    select: { id: true, createdAt: true },
  })
  if (proposals.length === 0) return null

  const sentEvents = await prisma.approvalEvent.findMany({
    where: {
      proposalId: { in: proposals.map(p => p.id) },
      action: 'sent',
    },
    select: { proposalId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    distinct: ['proposalId'],
  })
  if (sentEvents.length === 0) return null

  const eventMap = new Map(sentEvents.map(e => [e.proposalId, e.createdAt]))
  const diffs: number[] = []
  for (const p of proposals) {
    const sentAt = eventMap.get(p.id)
    if (sentAt) diffs.push((sentAt.getTime() - p.createdAt.getTime()) / 86_400_000)
  }
  if (diffs.length === 0) return null
  return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length)
}

// ─── Expiring proposals ───────────────────────────────────────────────────────

export type ExpiringProposal = {
  id: string
  number: string
  clientName: string
  projectTitle: string
  total: number
  validUntil: Date
}

export async function expiringProposals(filter: RoleFilter): Promise<ExpiringProposal[]> {
  const now = new Date()
  const in7days = new Date(now.getTime() + 7 * 86_400_000)
  const rows = await prisma.proposal.findMany({
    where: {
      ...proposalWhere(filter),
      status: { in: ['APPROVED', 'SENT'] },
      validUntil: { gte: now, lte: in7days },
    },
    select: {
      id: true,
      number: true,
      clientName: true,
      projectTitle: true,
      total: true,
      validUntil: true,
    },
    orderBy: { validUntil: 'asc' },
  })
  return rows.map(r => ({ ...r, total: Number(r.total) }))
}

// ─── Pending approvals queue ──────────────────────────────────────────────────

export type PendingApproval = {
  id: string
  number: string
  clientName: string
  projectTitle: string
  total: number
  updatedAt: Date
  createdBy: { name: string }
}

export async function pendingApprovalsForUser(userId: string): Promise<PendingApproval[]> {
  const rows = await prisma.proposal.findMany({
    where: { status: 'PENDING_APPROVAL', assignedApproverId: userId },
    select: {
      id: true,
      number: true,
      clientName: true,
      projectTitle: true,
      total: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
    },
    orderBy: { updatedAt: 'asc' },
  })
  return rows.map(r => ({ ...r, total: Number(r.total) }))
}

// ─── Recent proposals ─────────────────────────────────────────────────────────

export type RecentProposal = {
  id: string
  number: string
  clientName: string
  projectTitle: string
  status: string
  total: number
  updatedAt: Date
}

export async function recentProposals(filter: RoleFilter): Promise<RecentProposal[]> {
  const rows = await prisma.proposal.findMany({
    where: proposalWhere(filter),
    select: {
      id: true,
      number: true,
      clientName: true,
      projectTitle: true,
      status: true,
      total: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  })
  return rows.map(r => ({ ...r, total: Number(r.total) }))
}

// ─── Active proposal count ────────────────────────────────────────────────────

export async function activeProposalCount(filter: RoleFilter): Promise<number> {
  return prisma.proposal.count({
    where: {
      ...proposalWhere(filter),
      status: { notIn: ['WON', 'LOST', 'EXPIRED'] },
    },
  })
}

// ─── Won / lost this month ────────────────────────────────────────────────────

export async function wonLostThisMonth(
  filter: RoleFilter,
): Promise<{ won: number; lost: number }> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const base = { ...proposalWhere(filter), updatedAt: { gte: monthStart } }
  const [won, lost] = await Promise.all([
    prisma.proposal.count({ where: { ...base, status: 'WON' } }),
    prisma.proposal.count({ where: { ...base, status: 'LOST' } }),
  ])
  return { won, lost }
}

// ─── Pipeline funnel ──────────────────────────────────────────────────────────

export type FunnelStep = { status: string; label: string; count: number }

export async function pipelineFunnel(filter: RoleFilter): Promise<FunnelStep[]> {
  const steps = [
    { status: 'DRAFT' as const, label: 'Draft' },
    { status: 'PENDING_APPROVAL' as const, label: 'Pending' },
    { status: 'APPROVED' as const, label: 'Approved' },
    { status: 'SENT' as const, label: 'Sent' },
    { status: 'WON' as const, label: 'Won' },
  ]
  const counts = await Promise.all(
    steps.map(s =>
      prisma.proposal.count({ where: { ...proposalWhere(filter), status: s.status } }),
    ),
  )
  return steps.map((s, i) => ({ ...s, count: counts[i] }))
}

// ─── Admin stats ──────────────────────────────────────────────────────────────

export type AdminStats = {
  activeUsers: number
  thisMonth: number
  lastMonth: number
  activeServices: number
  dormantServices: Array<{ id: string; name: string; category: string }>
}

export async function adminStats(): Promise<AdminStats> {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const since90 = new Date(now.getTime() - 90 * 86_400_000)

  const [activeUsers, thisMonth, lastMonth, activeServices, dormantServices] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.proposal.count({ where: { createdAt: { gte: thisMonthStart } } }),
    prisma.proposal.count({ where: { createdAt: { gte: lastMonthStart, lt: thisMonthStart } } }),
    prisma.service.count({ where: { isActive: true } }),
    prisma.service.findMany({
      where: {
        isActive: true,
        lineItems: { none: { proposal: { createdAt: { gte: since90 } } } },
      },
      select: { id: true, name: true, category: true },
    }),
  ])

  return { activeUsers, thisMonth, lastMonth, activeServices, dormantServices }
}
