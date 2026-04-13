'use client'

import { useDroppable } from '@dnd-kit/core'
import { Lock } from 'lucide-react'
import { KanbanCard, KanbanCardSkeleton } from './KanbanCard'
import type { KanbanColumnConfig } from './config'
import type { ProposalListItem } from '@/lib/actions/proposals'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrencyShort(total: number) {
  if (total === 0) return '₱0'
  if (total >= 1_000_000) {
    return '₱' + (total / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  }
  if (total >= 1_000) {
    return '₱' + (total / 1_000).toFixed(0) + 'K'
  }
  return '₱' + total.toLocaleString('en-PH')
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  column: KanbanColumnConfig
  proposals: ProposalListItem[]
  currentUserId: string
  currentUserRole: string
  activeId: string | null
  isOver: boolean
  isLoading?: boolean
  onWinLossModal: (id: string, type: 'WON' | 'LOST') => void
  onMarkAsSent: (id: string) => void
  onMarkOnHold: (id: string) => void
  onDuplicate: (id: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KanbanColumn({
  column,
  proposals,
  currentUserId,
  currentUserRole,
  activeId,
  isOver,
  isLoading,
  onWinLossModal,
  onMarkAsSent,
  onMarkOnHold,
  onDuplicate,
}: Props) {
  const { setNodeRef } = useDroppable({ id: column.status })

  const columnTotal = proposals.reduce((sum, p) => sum + parseFloat(p.total), 0)

  const dropOverStyle = isOver
    ? column.dropAllowed
      ? 'ring-2 ring-indigo-400 ring-inset'
      : 'ring-2 ring-red-400 ring-inset bg-red-50/60'
    : ''

  return (
    <div className="relative flex flex-col w-[280px] shrink-0 rounded-[12px] border border-slate-200 overflow-hidden bg-white">
      {/* Column header */}
      <div
        className={[
          'border-t-4 px-3 pt-3 pb-2',
          column.colorClass,
          column.headerBg,
        ].join(' ')}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-800 flex-1 truncate">
            {column.label}
          </span>
          {!column.dropAllowed && (
            <Lock
              className="h-3 w-3 text-slate-400 shrink-0"
              aria-label="Column is locked — drag not allowed"
            />
          )}
          <span className="text-xs font-semibold text-slate-500 bg-white/70 rounded-full px-1.5 py-0.5 border border-slate-200 tabular-nums">
            {proposals.length}
          </span>
        </div>
        {proposals.length > 0 && (
          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            {formatCurrencyShort(columnTotal)} total
          </p>
        )}
      </div>

      {/* Droppable body */}
      <div
        ref={setNodeRef}
        className={[
          'flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2 transition-colors',
          dropOverStyle,
        ].join(' ')}
        style={{ maxHeight: 'calc(100vh - 280px)' }}
      >
        {isLoading ? (
          <>
            <KanbanCardSkeleton height={132} />
            <KanbanCardSkeleton height={110} />
          </>
        ) : proposals.length === 0 ? (
          <div className="flex items-center justify-center h-20 rounded-[8px] border-2 border-dashed border-slate-200">
            <span className="text-xs text-slate-400">No proposals</span>
          </div>
        ) : (
          proposals.map((p) => (
            <KanbanCard
              key={p.id}
              proposal={p}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onWinLossModal={onWinLossModal}
              onMarkAsSent={onMarkAsSent}
              onMarkOnHold={onMarkOnHold}
              onDuplicate={onDuplicate}
            />
          ))
        )}

        {/* Drag-over blocked overlay tooltip */}
        {isOver && !column.dropAllowed && column.dropBlockedReason && (
          <div className="absolute inset-x-2 bottom-2 bg-red-600 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-10">
            {column.dropBlockedReason}
          </div>
        )}
      </div>

      {/* Summary footer — only when not empty */}
      {proposals.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">
            {proposals.length} proposal{proposals.length !== 1 ? 's' : ''}
          </span>
          <span className="text-[10px] text-slate-500 font-medium tabular-nums">
            {formatCurrencyShort(columnTotal)}
          </span>
        </div>
      )}
    </div>
  )
}
