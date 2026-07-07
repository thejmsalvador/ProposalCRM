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
  const groups = await prisma.proposal.groupBy({
    by: ['status'],
    where: {
      ...proposalWhere(filter),
      updatedAt: { gte: since },
      status: { in: ['WON', 'LOST'] },
    },
    _count: { id: true },
  })
  const won = groups.find(g => g.status === 'WON')?._count.id ?? 0
  const lost = groups.find(g => g.status === 'LOST')?._count.id ?? 0
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

// ─── Hot proposals (temperature) ──────────────────────────────────────────────

export type HotProposal = {
  id: string
  number: string
  clientName: string
  projectTitle: string
  total: number
  updatedAt: Date
}

// Open (not WON/LOST/EXPIRED) proposals flagged HOT, for a "prioritize follow-up"
// dashboard widget. Scoped to the caller's visibility like every other widget.
export async function hotProposals(filter: RoleFilter): Promise<HotProposal[]> {
  const rows = await prisma.proposal.findMany({
    where: {
      ...proposalWhere(filter),
      temperature: 'HOT',
      status: { notIn: ['WON', 'LOST', 'EXPIRED'] },
    },
    select: {
      id: true,
      number: true,
      clientName: true,
      projectTitle: true,
      total: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 8,
  })
  return rows.map(r => ({ ...r, total: Number(r.total) }))
}

// ─── Active proposal count ────────────────────────────────────────────────────

// Derived from the proposalsByStatus result (same role filter) — no extra query.
const TERMINAL_STATUSES = ['WON', 'LOST', 'EXPIRED']

export function activeProposalCount(statusCounts: StatusCount[]): number {
  return statusCounts
    .filter(c => !TERMINAL_STATUSES.includes(c.status))
    .reduce((sum, c) => sum + c.count, 0)
}

// ─── Won / lost this month ────────────────────────────────────────────────────

export async function wonLostThisMonth(
  filter: RoleFilter,
): Promise<{ won: number; lost: number }> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const groups = await prisma.proposal.groupBy({
    by: ['status'],
    where: {
      ...proposalWhere(filter),
      updatedAt: { gte: monthStart },
      status: { in: ['WON', 'LOST'] },
    },
    _count: { id: true },
  })
  return {
    won: groups.find(g => g.status === 'WON')?._count.id ?? 0,
    lost: groups.find(g => g.status === 'LOST')?._count.id ?? 0,
  }
}

// ─── Pipeline funnel ──────────────────────────────────────────────────────────

export type FunnelStep = { status: string; label: string; count: number }

const FUNNEL_STEPS = [
  { status: 'DRAFT', label: 'Draft' },
  { status: 'PENDING_APPROVAL', label: 'Pending' },
  { status: 'APPROVED', label: 'Approved' },
  { status: 'SENT', label: 'Sent' },
  { status: 'WON', label: 'Won' },
]

// Derived from the proposalsByStatus result (same role filter) — no extra query.
export function pipelineFunnel(statusCounts: StatusCount[]): FunnelStep[] {
  const byStatus = new Map(statusCounts.map(c => [c.status, c.count]))
  return FUNNEL_STEPS.map(s => ({ ...s, count: byStatus.get(s.status) ?? 0 }))
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
