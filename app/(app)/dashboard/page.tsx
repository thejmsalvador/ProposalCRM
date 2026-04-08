import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getPendingApprovals } from '@/lib/actions/proposals'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CheckCircle2, Clock } from 'lucide-react'

function fmt(value: string) {
  const n = parseFloat(value)
  if (isNaN(n)) return '₱0.00'
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'less than an hour ago'
  if (hours === 1) return '1 hour ago'
  if (hours < 24) return `${hours} hours ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canApprove = can(session.user, 'approve:proposal')
  const pendingApprovals = canApprove ? await getPendingApprovals() : []

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Pending Approvals Queue */}
      {canApprove && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Pending Approvals
              {pendingApprovals.length > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold w-5 h-5">
                  {pendingApprovals.length}
                </span>
              )}
            </h2>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white flex flex-col items-center justify-center py-10 gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-400" />
              <p className="text-slate-500 text-sm">No proposals awaiting your approval.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
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
                      Submitted
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Total
                    </th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((p, i) => (
                    <tr
                      key={p.id}
                      className={`border-b border-slate-100 last:border-0 ${
                        i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
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
                        {fmt(p.total)}
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
        </section>
      )}

      {/* Placeholder for remaining dashboard sections (Step 15) */}
      <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-white p-8 flex items-center justify-center">
        <p className="text-[var(--color-muted)] text-sm">
          Full dashboard charts & stats — coming in Step 15
        </p>
      </div>
    </div>
  )
}
