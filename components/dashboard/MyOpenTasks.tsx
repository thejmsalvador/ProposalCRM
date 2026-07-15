import Link from 'next/link'
import { CalendarDays, CheckCircle2, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OpenTask } from '@/lib/queries/dashboard'

// Due dates are date-only values stored as UTC midnight — format and compare
// in UTC so the day never shifts with the server/viewer timezone.
function fmtDue(date: Date) {
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function isOverdue(dueDate: Date | null) {
  if (!dueDate) return false
  const today = new Date().toLocaleDateString('en-CA')
  return dueDate.toISOString().slice(0, 10) < today
}

/**
 * Dashboard widget: incomplete activity-feed tasks assigned to the current
 * user, soonest due first. Rows deep-link to the proposal's Activity tab.
 */
export function MyOpenTasks({ tasks }: { tasks: OpenTask[] }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <CheckSquare className="h-4 w-4 text-emerald-500" aria-hidden="true" />
        My Tasks
        {tasks.length > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold w-5 h-5">
            {tasks.length}
          </span>
        )}
      </h3>
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
          <CheckCircle2 className="h-7 w-7 text-green-300" aria-hidden="true" />
          <p className="text-xs text-slate-400">No open tasks assigned to you.</p>
          <Link
            href="/proposals"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            View proposals
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((t) => {
            const overdue = isOverdue(t.dueDate)
            return (
              <li key={t.id}>
                <Link
                  href={`/proposals/${t.proposal.id}?tab=activity`}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors border',
                    overdue
                      ? 'bg-red-50 hover:bg-red-100 border-red-100'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-100',
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{t.title}</div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">
                      <span className="font-mono font-semibold text-indigo-700">
                        {t.proposal.number}
                      </span>{' '}
                      · {t.proposal.projectTitle} · from {t.createdBy.name}
                    </div>
                  </div>
                  {t.dueDate && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shrink-0',
                        overdue ? 'bg-red-100 text-red-700' : 'bg-white text-slate-600',
                      )}
                    >
                      <CalendarDays className="h-3 w-3" aria-hidden="true" />
                      {overdue ? `Overdue — ${fmtDue(t.dueDate)}` : fmtDue(t.dueDate)}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
