'use client'

import { useMemo, useState } from 'react'
import { Clock, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActivityUser, ProposalActivityItem } from '@/lib/activity-shared'
import type { ProposalDetail, ProposalVersionEntry } from '@/lib/actions/proposals'
import { ActivityComposer } from './ActivityComposer'
import { ActivityItemCard } from './ActivityItemCard'
import {
  APPROVAL_EVENT_LABELS,
  STATUS_LABELS,
  STATUS_STYLES,
  fmtDateTime,
  timeAgo,
} from './helpers'

type ApprovalEventEntry = ProposalDetail['approvalEvents'][number]

// The feed interleaves user-posted activities with system events (version
// saves + approval events), newest first.
type FeedItem =
  | { kind: 'activity'; data: ProposalActivityItem }
  | { kind: 'version'; data: ProposalVersionEntry }
  | { kind: 'event'; data: ApprovalEventEntry }

type Filter = 'all' | 'TASK' | 'NOTE' | 'FILE' | 'LINK' | 'system'

const EMPTY_COPY: Record<Filter, string> = {
  all: 'No activity yet. Post a note, task, file or link to get started.',
  TASK: 'No tasks yet.',
  NOTE: 'No notes yet.',
  FILE: 'No files yet.',
  LINK: 'No links yet.',
  system: 'No system events yet.',
}

type Props = {
  proposalId: string
  activities: ProposalActivityItem[]
  versions: ProposalVersionEntry[]
  approvalEvents: ApprovalEventEntry[]
  currentUser: { id: string; role: string }
  assignableUsers: ActivityUser[]
}

export function ActivityFeed({
  proposalId,
  activities,
  versions,
  approvalEvents,
  currentUser,
  assignableUsers,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  const allItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...activities.map((a) => ({ kind: 'activity' as const, data: a })),
      ...versions.map((v) => ({ kind: 'version' as const, data: v })),
      ...approvalEvents.map((e) => ({ kind: 'event' as const, data: e })),
    ]
    return items.sort(
      (a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime(),
    )
  }, [activities, versions, approvalEvents])

  const counts = useMemo(() => {
    const byType = { TASK: 0, NOTE: 0, FILE: 0, LINK: 0 }
    for (const a of activities) byType[a.type] += 1
    return {
      all: allItems.length,
      ...byType,
      system: versions.length + approvalEvents.length,
    }
  }, [activities, versions, approvalEvents, allItems])

  const visibleItems = useMemo(() => {
    if (filter === 'all') return allItems
    if (filter === 'system') return allItems.filter((i) => i.kind !== 'activity')
    return allItems.filter((i) => i.kind === 'activity' && i.data.type === filter)
  }, [allItems, filter])

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'TASK', label: 'Tasks' },
    { key: 'NOTE', label: 'Notes' },
    { key: 'FILE', label: 'Files' },
    { key: 'LINK', label: 'Links' },
    { key: 'system', label: 'System' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <ActivityComposer proposalId={proposalId} assignableUsers={assignableUsers} />

      <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter activity">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={cn(
              'inline-flex min-h-[32px] items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
              filter === key
                ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
            )}
          >
            {label}
            <span className={cn('font-normal', filter === key ? 'text-white/80' : 'text-slate-400')}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {visibleItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <Clock className="h-8 w-8 text-slate-300" />
          <p className="text-slate-500 text-sm">{EMPTY_COPY[filter]}</p>
        </div>
      ) : (
        <div className="relative pl-5">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-slate-200" />
          {visibleItems.map((item) => {
            if (item.kind === 'activity') {
              return (
                <ActivityItemCard
                  key={`a-${item.data.id}`}
                  item={item.data}
                  currentUser={currentUser}
                  assignableUsers={assignableUsers}
                />
              )
            }

            if (item.kind === 'version') {
              const v = item.data
              return (
                <div key={`v-${v.id}`} className="relative mb-4 last:mb-0">
                  <div className="absolute -left-3 top-1 w-2 h-2 rounded-full bg-slate-400 border-2 border-white" />
                  <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm font-medium text-slate-700">
                          Version {v.versionNumber} saved
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_STYLES[v.status] ?? 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {STATUS_LABELS[v.status] ?? v.status}
                        </span>
                      </div>
                      <span
                        className="text-xs text-slate-400 cursor-default"
                        title={fmtDateTime(v.createdAt)}
                      >
                        {timeAgo(v.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">by {v.createdBy.name}</p>
                    {v.changeSummary && (
                      <p className="text-xs text-slate-500 mt-1 italic">{v.changeSummary}</p>
                    )}
                  </div>
                </div>
              )
            }

            const e = item.data
            return (
              <div key={`e-${e.id}`} className="relative mb-4 last:mb-0">
                <div className="absolute -left-3 top-1 w-2 h-2 rounded-full bg-indigo-400 border-2 border-white" />
                <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800">
                      {APPROVAL_EVENT_LABELS[e.action] ?? e.action}
                    </span>
                    <span
                      className="text-xs text-slate-400 cursor-default"
                      title={fmtDateTime(e.createdAt)}
                    >
                      {timeAgo(e.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">by {e.actor.name}</p>
                  {e.comment && (
                    <p className="mt-2 text-sm text-slate-600 bg-slate-50 rounded p-2 border border-slate-100">
                      {e.comment}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
