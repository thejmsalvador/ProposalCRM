import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  TrendingUp,
  FileText,
  Trophy,
  XCircle,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  Package,
  ChevronRight,
  BarChart2,
  AlertCircle,
  PlusCircle,
  Flame,
} from 'lucide-react'

import { getSession } from '@/lib/auth'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AutoRefresh } from '@/components/dashboard/AutoRefresh'
import {
  LazyStatusDonut as StatusDonut,
  LazyPipelineFunnel as PipelineFunnel,
} from '@/components/dashboard/LazyCharts'
import {
  proposalsByStatus,
  pipelineValue,
  winRate,
  avgDraftToSent,
  expiringProposals,
  pendingApprovalsForUser,
  recentProposals,
  hotProposals,
  activeProposalCount,
  wonLostThisMonth,
  pipelineFunnel,
  adminStats,
  type RoleFilter,
} from '@/lib/queries/dashboard'

export const revalidate = 60

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtRelative(date: Date) {
  const diff = Date.now() - date.getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'less than an hour ago'
  if (hours === 1) return '1 hour ago'
  if (hours < 24) return `${hours} hours ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000)
}

function fmtDate(date: Date) {
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  REVISION_REQUIRED: 'bg-orange-100 text-orange-700',
  APPROVED: 'bg-indigo-100 text-indigo-700',
  SENT: 'bg-purple-100 text-purple-700',
  WON: 'bg-green-100 text-green-700',
  LOST: 'bg-red-100 text-red-700',
  ON_HOLD: 'bg-slate-200 text-slate-600',
  EXPIRED: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending',
  REVISION_REQUIRED: 'Revision',
  APPROVED: 'Approved',
  SENT: 'Sent',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On Hold',
  EXPIRED: 'Expired',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600',
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor = 'text-slate-400',
  className,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  iconColor?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--color-border)] bg-white p-5 flex flex-col gap-3',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          {label}
        </span>
        <Icon className={cn('h-4 w-4', iconColor)} aria-hidden="true" />
      </div>
      <div className="text-2xl font-bold text-[var(--color-primary)] leading-none">{value}</div>
      {sub && <p className="text-xs text-[var(--color-muted)]">{sub}</p>}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  )
}

// ─── Expiring card ────────────────────────────────────────────────────────────

type ExpiringItem = {
  id: string
  number: string
  clientName: string
  projectTitle: string
  total: number
  validUntil: Date
}

function ExpiringCard({ expiring }: { expiring: ExpiringItem[] }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden="true" />
        Expiring Soon
        {expiring.length > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold w-5 h-5">
            {expiring.length}
          </span>
        )}
      </h3>
      {expiring.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
          <CheckCircle2 className="h-7 w-7 text-green-300" aria-hidden="true" />
          <p className="text-xs text-slate-400">No proposals expiring in the next 7 days.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {expiring.map(p => {
            const days = daysUntil(p.validUntil)
            const isDanger = days <= 2
            return (
              <li key={p.id}>
                <Link
                  href={`/proposals/${p.id}`}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors',
                    isDanger
                      ? 'bg-red-50 hover:bg-red-100 border border-red-100'
                      : 'bg-amber-50 hover:bg-amber-100 border border-amber-100',
                  )}
                >
                  <div className="min-w-0">
                    <div
                      className={cn(
                        'font-mono text-xs font-semibold',
                        isDanger ? 'text-red-700' : 'text-amber-700',
                      )}
                    >
                      {p.number}
                    </div>
                    <div className="text-xs text-slate-600 truncate mt-0.5">
                      {p.projectTitle} · {p.clientName}
                    </div>
                  </div>
                  <div className="ml-3 text-right shrink-0">
                    <div
                      className={cn(
                        'text-xs font-bold',
                        isDanger ? 'text-red-600' : 'text-amber-600',
                      )}
                    >
                      {days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`}
                    </div>
                    <div className="text-xs text-slate-400">{fmtDate(p.validUntil)}</div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const { user } = session
  const isManager =
    user.role === 'SALES_MANAGER' ||
    user.role === 'ADMIN' ||
    user.role === 'SUPER_ADMIN'
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

  const filter: RoleFilter = {
    userId: user.id,
    role: user.role,
    teamId: user.teamId ?? null,
  }

  // Core data — all roles
  const [statusCounts, pipeline, wonLost, expiring, recent, hot] = await Promise.all([
    proposalsByStatus(filter),
    pipelineValue(filter),
    wonLostThisMonth(filter),
    expiringProposals(filter),
    recentProposals(filter),
    hotProposals(filter),
  ])

  // Derived from statusCounts — no extra queries
  const active = activeProposalCount(statusCounts)
  const funnel = isManager ? pipelineFunnel(statusCounts) : null

  // Manager data
  const managerData = isManager
    ? await Promise.all([
        pendingApprovalsForUser(user.id),
        winRate(filter, 30),
        winRate(filter, 90),
        avgDraftToSent(filter),
      ])
    : null

  const [pendingList, wr30, wr90, avgDays] = managerData ?? [[], null, null, null]

  // Admin data
  const adminData = isAdmin ? await adminStats() : null

  // Empty state for brand-new users
  const totalProposals = statusCounts.reduce((s, c) => s + c.count, 0)
  if (totalProposals === 0 && !isAdmin) {
    return (
      <>
        <AutoRefresh />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
          <div className="rounded-full bg-indigo-50 p-6">
            <FileText className="h-12 w-12 text-indigo-400" aria-hidden="true" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-[var(--color-primary)]">
              Welcome to ProposalCRM
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted)] max-w-sm">
              You don&apos;t have any proposals yet. Create your first one to get started.
            </p>
          </div>
          <Link href="/proposals/new" className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Create your first proposal
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <AutoRefresh />
      <div className="flex flex-col gap-8 p-6 max-w-6xl mx-auto">

        {/* Page heading */}
        <div>
          <h1 className="text-xl font-bold text-[var(--color-primary)]">Dashboard</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">
            {isAdmin
              ? 'Organisation overview'
              : isManager
              ? 'Team overview'
              : 'Your pipeline'}
          </p>
        </div>

        {/* ── Pending Approvals (manager+) ──────────────────────────────────── */}
        {isManager && (
          <Section
            title={
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" aria-hidden="true" />
                Pending Approvals
                {(pendingList?.length ?? 0) > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold w-5 h-5">
                    {pendingList!.length}
                  </span>
                )}
              </span>
            }
          >
            {(pendingList?.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white flex flex-col items-center justify-center py-8 gap-2">
                <CheckCircle2 className="h-7 w-7 text-green-400" aria-hidden="true" />
                <p className="text-slate-500 text-sm">No proposals awaiting your approval.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Proposal
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Client
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">
                        Submitted by
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden md:table-cell">
                        Waiting
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Total
                      </th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {pendingList!.map((p, i) => (
                      <tr
                        key={p.id}
                        className={cn(
                          'border-b border-slate-100 last:border-0',
                          i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30',
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs text-indigo-700 font-semibold">
                            {p.number}
                          </div>
                          <div className="text-slate-700 mt-0.5 line-clamp-1">{p.projectTitle}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{p.clientName}</td>
                        <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                          {p.createdBy.name}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">
                          {fmtRelative(p.updatedAt)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                          {fmtCurrency(p.total)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/proposals/${p.id}`}
                            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                          >
                            Review
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* ── Stat cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Pipeline Value"
            value={fmtCurrency(pipeline)}
            sub="Approved + Sent"
            icon={TrendingUp}
            iconColor="text-indigo-400"
            className="col-span-2 lg:col-span-1"
          />
          <StatCard
            label="Active Proposals"
            value={active}
            sub="Non-terminal statuses"
            icon={FileText}
            iconColor="text-blue-400"
            className="col-span-2 lg:col-span-1"
          />
          <StatCard
            label="Won This Month"
            value={wonLost.won}
            sub={wonLost.won === 0 ? 'None yet this month' : undefined}
            icon={Trophy}
            iconColor="text-green-400"
          />
          <StatCard
            label="Lost This Month"
            value={wonLost.lost}
            icon={XCircle}
            iconColor="text-red-400"
          />
        </div>

        {/* ── Charts row ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Status donut */}
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Proposals by Status
            </h3>
            <StatusDonut data={statusCounts} />
          </div>

          {/* Pipeline funnel for managers, expiring soon for execs */}
          {isManager && funnel ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
                Pipeline Funnel
              </h3>
              <PipelineFunnel data={funnel} />
            </div>
          ) : (
            <ExpiringCard expiring={expiring} />
          )}
        </div>

        {/* ── Hot proposals (temperature) ──────────────────────────────────── */}
        {hot.length > 0 && (
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Flame className="h-4 w-4 text-red-500" aria-hidden="true" />
              Hot Proposals
              <span className="inline-flex items-center justify-center rounded-full bg-red-100 text-red-700 text-xs font-bold w-5 h-5">
                {hot.length}
              </span>
            </h3>
            <ul className="flex flex-col gap-2">
              {hot.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/proposals/${p.id}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm bg-red-50 hover:bg-red-100 border border-red-100 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-semibold text-red-700">{p.number}</div>
                      <div className="text-xs text-slate-600 truncate mt-0.5">
                        {p.projectTitle} · {p.clientName}
                      </div>
                    </div>
                    <div className="ml-3 text-right shrink-0 text-xs font-bold text-slate-700">
                      {fmtCurrency(p.total)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Manager metrics ──────────────────────────────────────────────── */}
        {isManager && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-white p-5 flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Win Rate — 30 days
                </span>
                <span className="text-3xl font-bold text-[var(--color-primary)]">
                  {wr30 !== null ? `${wr30}%` : '—'}
                </span>
                <span className="text-xs text-[var(--color-muted)]">WON / (WON + LOST)</span>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-white p-5 flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Win Rate — 90 days
                </span>
                <span className="text-3xl font-bold text-[var(--color-primary)]">
                  {wr90 !== null ? `${wr90}%` : '—'}
                </span>
                <span className="text-xs text-[var(--color-muted)]">WON / (WON + LOST)</span>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-white p-5 flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Avg Draft → Sent
                </span>
                <span className="text-3xl font-bold text-[var(--color-primary)]">
                  {avgDays !== null ? `${avgDays}d` : '—'}
                </span>
                <span className="text-xs text-[var(--color-muted)]">Average calendar days</span>
              </div>
            </div>

            {/* Expiring soon shown below pipeline funnel for managers */}
            <ExpiringCard expiring={expiring} />
          </>
        )}

        {/* ── Admin organisation stats ─────────────────────────────────────── */}
        {isAdmin && adminData && (
          <Section title="Organisation">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Active Users"
                value={adminData.activeUsers}
                icon={Users}
                iconColor="text-blue-400"
              />
              <StatCard
                label="This Month"
                value={adminData.thisMonth}
                sub={`${adminData.lastMonth} last month`}
                icon={FileText}
                iconColor="text-indigo-400"
              />
              <StatCard
                label="Active Services"
                value={adminData.activeServices}
                sub="In catalog"
                icon={Package}
                iconColor="text-teal-400"
              />
              <StatCard
                label="Dormant Services"
                value={adminData.dormantServices.length}
                sub="No proposals in 90d"
                icon={AlertCircle}
                iconColor={
                  adminData.dormantServices.length > 0 ? 'text-amber-400' : 'text-slate-300'
                }
              />
            </div>
            {adminData.dormantServices.length > 0 && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-xs font-semibold text-amber-700 mb-2">
                  Services with no recent proposals (90 days)
                </p>
                <div className="flex flex-wrap gap-2">
                  {adminData.dormantServices.map(s => (
                    <Link
                      key={s.id}
                      href="/catalog"
                      className="inline-flex items-center gap-1 rounded-full bg-white border border-amber-200 px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-50 transition-colors"
                    >
                      {s.name}
                      <span className="text-amber-400">·</span>
                      <span className="text-amber-500">{s.category}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ── Recent proposals ─────────────────────────────────────────────── */}
        <Section
          title={
            <span className="flex items-center justify-between w-full">
              <span>Recent Proposals</span>
              <Link
                href="/proposals"
                className="text-xs font-normal text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
              >
                View all <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </span>
          }
        >
          {recent.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white flex flex-col items-center justify-center py-8 gap-3">
              <FileText className="h-7 w-7 text-slate-300" aria-hidden="true" />
              <p className="text-slate-400 text-sm">No proposals yet.</p>
              <Link href="/proposals/new" className={cn(buttonVariants({ size: 'sm' }), 'gap-1')}>
                <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Create proposal
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Proposal
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">
                      Client
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Total
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 hidden md:table-cell">
                      Updated
                    </th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p, i) => (
                    <tr
                      key={p.id}
                      className={cn(
                        'border-b border-slate-100 last:border-0',
                        i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-indigo-700 font-semibold">
                          {p.number}
                        </div>
                        <div className="text-slate-700 mt-0.5 text-xs line-clamp-1">
                          {p.projectTitle}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 hidden sm:table-cell">
                        {p.clientName}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800 text-xs">
                        {fmtCurrency(p.total)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-400 hidden md:table-cell">
                        {fmtRelative(p.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/proposals/${p.id}`}
                          className={cn(
                            buttonVariants({ variant: 'ghost', size: 'sm' }),
                            'h-7 px-2',
                          )}
                          aria-label={`View proposal ${p.number}`}
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

      </div>
    </>
  )
}
