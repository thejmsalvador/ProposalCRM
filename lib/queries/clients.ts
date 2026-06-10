import { prisma } from '@/lib/prisma'
import { Role, ProposalStatus } from '@/lib/generated/prisma/enums'

// ─── Types ────────────────────────────────────────────────────────────────────

export type HealthStatus = 'Active' | 'Dormant' | 'Lapsed'

export type ClientListItem = {
  id: string
  companyName: string
  industry: string | null
  website: string | null
  totalProposals: number
  wonDeals: number
  lostDeals: number
  activeDeals: number
  lifetimeValue: number
  activeValue: number
  primaryContact: { contactName: string | null; contactTitle: string | null } | null
  createdAt: Date
  lastWonAt: Date | null
  lastActivityAt: Date | null
  // Computed
  winRate: number
  daysSinceLastActivity: number | null
  health: HealthStatus
}

export type ClientDetailProposal = {
  id: string
  number: string
  projectTitle: string
  total: number
  status: ProposalStatus
  createdAt: Date
  updatedAt: Date
  createdByName: string
}

export type ClientContactDetail = {
  id: string
  contactName: string | null
  contactTitle: string | null
  email: string | null
  phone: string | null
  isPrimary: boolean
  notes: string | null
  createdById: string
  createdAt: Date
}

export type ClientDetail = ClientListItem & {
  address: string | null
  notes: string | null
  contacts: ClientContactDetail[]
  proposals: ClientDetailProposal[]
  averageDealSize: number
  daysSinceCreated: number
  daysSinceLastWon: number | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: ProposalStatus[] = [
  ProposalStatus.DRAFT,
  ProposalStatus.PENDING_APPROVAL,
  ProposalStatus.REVISION_REQUIRED,
  ProposalStatus.APPROVED,
  ProposalStatus.SENT,
]

function computeHealth(daysSinceLastActivity: number | null): HealthStatus {
  if (daysSinceLastActivity === null) return 'Lapsed'
  if (daysSinceLastActivity <= 90) return 'Active'
  if (daysSinceLastActivity <= 180) return 'Dormant'
  return 'Lapsed'
}

function daysBetween(from: Date, to: Date = new Date()): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

function buildWhereClause(userId: string, role: Role, teamId: string | null) {
  if (role === Role.ADMIN || role === Role.SUPER_ADMIN) {
    return {}
  }
  if (role === Role.SALES_MANAGER && teamId) {
    return {
      proposals: {
        some: {
          createdBy: { teamId },
        },
      },
    }
  }
  // SALES_EXEC — only clients linked to their own proposals
  return {
    proposals: {
      some: { createdById: userId },
    },
  }
}

// ─── getClientList ─────────────────────────────────────────────────────────

type ClientStats = {
  totalProposals: number
  wonDeals: number
  lostDeals: number
  activeDeals: number
  lifetimeValue: number
  activeValue: number
  lastActivityAt: Date | null
  lastWonAt: Date | null
}

const EMPTY_STATS: ClientStats = {
  totalProposals: 0,
  wonDeals: 0,
  lostDeals: 0,
  activeDeals: 0,
  lifetimeValue: 0,
  activeValue: 0,
  lastActivityAt: null,
  lastWonAt: null,
}

export async function getClientList(
  userId: string,
  role: Role,
  teamId: string | null,
): Promise<ClientListItem[]> {
  const where = buildWhereClause(userId, role, teamId)

  const clients = await prisma.client.findMany({
    where,
    select: {
      id: true,
      companyName: true,
      industry: true,
      website: true,
      createdAt: true,
      contacts: {
        where: { isPrimary: true },
        take: 1,
        select: { contactName: true, contactTitle: true },
      },
    },
    orderBy: { companyName: 'asc' },
  })

  if (clients.length === 0) return []

  // One grouped aggregate replaces fetching every proposal row:
  // at most clients × 9 status rows come back regardless of proposal count.
  const grouped = await prisma.proposal.groupBy({
    by: ['clientId', 'status'],
    where: { clientId: { in: clients.map((c) => c.id) } },
    _count: { _all: true },
    _sum: { total: true },
    _max: { updatedAt: true },
  })

  const statsByClient = new Map<string, ClientStats>()
  for (const row of grouped) {
    if (!row.clientId) continue
    const stats = statsByClient.get(row.clientId) ?? { ...EMPTY_STATS }
    const count = row._count._all
    const sum = Number(row._sum.total ?? 0)
    const maxUpdated = row._max.updatedAt

    stats.totalProposals += count
    if (row.status === ProposalStatus.WON) {
      stats.wonDeals += count
      stats.lifetimeValue += sum
      stats.lastWonAt = maxUpdated
    }
    if (row.status === ProposalStatus.LOST) stats.lostDeals += count
    if (ACTIVE_STATUSES.includes(row.status as ProposalStatus)) stats.activeDeals += count
    if (row.status === ProposalStatus.APPROVED || row.status === ProposalStatus.SENT) {
      stats.activeValue += sum
    }
    if (maxUpdated && (!stats.lastActivityAt || maxUpdated > stats.lastActivityAt)) {
      stats.lastActivityAt = maxUpdated
    }
    statsByClient.set(row.clientId, stats)
  }

  const now = new Date()

  return clients.map((c) => {
    const stats = statsByClient.get(c.id) ?? EMPTY_STATS
    const wonAndLost = stats.wonDeals + stats.lostDeals
    const winRate =
      wonAndLost > 0 ? Math.round((stats.wonDeals / wonAndLost) * 1000) / 10 : 0
    const daysSinceLastActivity = stats.lastActivityAt
      ? daysBetween(stats.lastActivityAt, now)
      : null

    return {
      id: c.id,
      companyName: c.companyName,
      industry: c.industry,
      website: c.website,
      totalProposals: stats.totalProposals,
      wonDeals: stats.wonDeals,
      lostDeals: stats.lostDeals,
      activeDeals: stats.activeDeals,
      lifetimeValue: stats.lifetimeValue,
      activeValue: stats.activeValue,
      primaryContact: c.contacts[0] ?? null,
      createdAt: c.createdAt,
      lastWonAt: stats.lastWonAt,
      lastActivityAt: stats.lastActivityAt,
      winRate,
      daysSinceLastActivity,
      health: computeHealth(daysSinceLastActivity),
    }
  })
}

// ─── getClientDetail ──────────────────────────────────────────────────────────

export async function getClientDetail(
  clientId: string,
  userId: string,
  role: Role,
  teamId: string | null,
): Promise<ClientDetail | null> {
  const where = buildWhereClause(userId, role, teamId)

  const client = await prisma.client.findFirst({
    where: { id: clientId, ...where },
    include: {
      contacts: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      },
      proposals: {
        // Slim select — the bare include dragged every column along,
        // including the large rich-text fields (introText, tcOverride, …)
        select: {
          id: true,
          number: true,
          projectTitle: true,
          total: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!client) return null

  const now = new Date()
  const proposals = client.proposals
  const wonProposals = proposals.filter((p) => p.status === ProposalStatus.WON)
  const lostDeals = proposals.filter((p) => p.status === ProposalStatus.LOST).length
  const activeDeals = proposals.filter((p) =>
    ACTIVE_STATUSES.includes(p.status as ProposalStatus),
  ).length

  const lifetimeValue = wonProposals.reduce((sum, p) => sum + Number(p.total), 0)
  const activeValue = proposals
    .filter(
      (p) =>
        p.status === ProposalStatus.APPROVED || p.status === ProposalStatus.SENT,
    )
    .reduce((sum, p) => sum + Number(p.total), 0)

  const wonDeals = wonProposals.length
  const totalProposals = proposals.length
  const wonAndLost = wonDeals + lostDeals
  const winRate = wonAndLost > 0 ? Math.round((wonDeals / wonAndLost) * 1000) / 10 : 0
  const averageDealSize = wonDeals > 0 ? lifetimeValue / wonDeals : 0

  const allDates = proposals.map((p) => p.updatedAt)
  const lastActivityAt = allDates.length > 0 ? new Date(Math.max(...allDates.map((d) => d.getTime()))) : null
  const daysSinceLastActivity = lastActivityAt ? daysBetween(lastActivityAt, now) : null

  const wonDates = wonProposals.map((p) => p.updatedAt)
  const lastWonAt = wonDates.length > 0 ? new Date(Math.max(...wonDates.map((d) => d.getTime()))) : null
  const daysSinceLastWon = lastWonAt ? daysBetween(lastWonAt, now) : null
  const daysSinceCreated = daysBetween(client.createdAt, now)

  return {
    id: client.id,
    companyName: client.companyName,
    industry: client.industry,
    website: client.website,
    address: client.address,
    notes: client.notes,
    totalProposals,
    wonDeals,
    lostDeals,
    activeDeals,
    lifetimeValue,
    activeValue,
    primaryContact: client.contacts.find((c) => c.isPrimary)
      ? {
          contactName: client.contacts.find((c) => c.isPrimary)!.contactName,
          contactTitle: client.contacts.find((c) => c.isPrimary)!.contactTitle,
        }
      : null,
    createdAt: client.createdAt,
    lastWonAt,
    lastActivityAt,
    winRate,
    daysSinceLastActivity,
    health: computeHealth(daysSinceLastActivity),
    averageDealSize,
    daysSinceCreated,
    daysSinceLastWon,
    contacts: client.contacts.map((c) => ({
      id: c.id,
      contactName: c.contactName,
      contactTitle: c.contactTitle,
      email: c.email,
      phone: c.phone,
      isPrimary: c.isPrimary,
      notes: c.notes,
      createdById: c.createdById,
      createdAt: c.createdAt,
    })),
    proposals: proposals.map((p) => ({
      id: p.id,
      number: p.number,
      projectTitle: p.projectTitle,
      total: Number(p.total),
      status: p.status as ProposalStatus,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      createdByName: p.createdBy.name,
    })),
  }
}
