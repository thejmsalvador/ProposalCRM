'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { KanbanColumn } from './KanbanColumn'
import { KanbanDragOverlay } from './KanbanDragOverlay'
import { KANBAN_COLUMNS } from './config'
import {
  markAsSent,
  markAsWon,
  markAsLost,
  markOnHold,
  revertToDraft,
  duplicateProposal,
  getKanbanColumnPage,
} from '@/lib/actions/proposals'
import type { ProposalListItem, KanbanColumnData } from '@/lib/actions/proposals'

// ─── Win/Loss modal ───────────────────────────────────────────────────────────

const LOST_REASONS = [
  'Budget',
  'Competitor Selected',
  'Timeline',
  'No Response',
  'Scope Mismatch',
  'Other',
]

type WinLossModal = {
  proposalId: string
  type: 'WON' | 'LOST'
}

function WinLossModal({
  modal,
  onClose,
  onConfirm,
  isPending,
}: {
  modal: WinLossModal
  onClose: () => void
  onConfirm: (data: { signedDate?: string; lostReason?: string }) => void
  isPending: boolean
}) {
  const [signedDate, setSignedDate] = useState('')
  const [lostReason, setLostReason] = useState('')
  const [lostOther, setLostOther] = useState('')

  const isWon = modal.type === 'WON'
  const effectiveReason = lostReason === 'Other' ? lostOther.trim() : lostReason

  function handleConfirm() {
    if (!isWon && !effectiveReason) {
      toast({ title: 'Reason required', description: 'Please select a reason for the loss.', variant: 'destructive' })
      return
    }
    onConfirm(isWon ? { signedDate: signedDate || undefined } : { lostReason: effectiveReason })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isWon ? 'Mark as Won' : 'Mark as Lost'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {isWon ? (
            <div>
              <Label htmlFor="signed-date" className="text-sm mb-1.5 block">
                Signed Date <span className="text-slate-400">(optional)</span>
              </Label>
              <Input
                id="signed-date"
                type="date"
                value={signedDate}
                onChange={(e) => setSignedDate(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="lost-reason" className="text-sm mb-1.5 block">
                  Reason <span className="text-red-500">*</span>
                </Label>
                <Select value={lostReason} onValueChange={setLostReason}>
                  <SelectTrigger id="lost-reason">
                    <SelectValue placeholder="Select a reason…" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOST_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {lostReason === 'Other' && (
                <div>
                  <Label htmlFor="lost-other" className="text-sm mb-1.5 block">
                    Please describe
                  </Label>
                  <Textarea
                    id="lost-other"
                    value={lostOther}
                    onChange={(e) => setLostOther(e.target.value)}
                    rows={2}
                    placeholder="Enter reason…"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isPending}
            className={isWon ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
          >
            {isPending ? 'Saving…' : isWon ? 'Mark as Won' : 'Mark as Lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Mobile tab bar ────────────────────────────────────────────────────────────

function MobileTabBar({
  activeStatus,
  visibleColumns,
  onSelect,
}: {
  activeStatus: string
  visibleColumns: typeof KANBAN_COLUMNS
  onSelect: (status: string) => void
}) {
  return (
    <div className="flex md:hidden overflow-x-auto gap-1.5 pb-2 scrollbar-none">
      {visibleColumns.map((col) => (
        <button
          key={col.status}
          onClick={() => onSelect(col.status)}
          className={[
            'shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            activeStatus === col.status
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400',
          ].join(' ')}
        >
          {col.label}
        </button>
      ))}
    </div>
  )
}

// ─── Empty board state ────────────────────────────────────────────────────────

function EmptyBoard() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
      <svg
        width="80"
        height="80"
        viewBox="0 0 80 80"
        fill="none"
        aria-hidden="true"
        className="text-slate-300"
      >
        <rect x="4" y="16" width="18" height="48" rx="4" fill="currentColor" opacity="0.4" />
        <rect x="28" y="16" width="18" height="36" rx="4" fill="currentColor" opacity="0.25" />
        <rect x="52" y="16" width="18" height="44" rx="4" fill="currentColor" opacity="0.15" />
        <rect x="4" y="20" width="18" height="8" rx="2" fill="currentColor" opacity="0.6" />
        <rect x="28" y="20" width="18" height="8" rx="2" fill="currentColor" opacity="0.4" />
        <rect x="52" y="20" width="18" height="8" rx="2" fill="currentColor" opacity="0.2" />
      </svg>
      <div>
        <p className="text-lg font-semibold text-slate-800">No proposals yet</p>
        <p className="text-sm text-slate-500 mt-1">Create your first proposal to get started</p>
      </div>
      <Link href="/proposals/new" className={buttonVariants()}>
        <Plus className="h-4 w-4 mr-2" />
        New Proposal
      </Link>
    </div>
  )
}

// ─── Main Board ───────────────────────────────────────────────────────────────

type ColumnState = {
  status: string
  total: number
  totalValue: number
  items: ProposalListItem[]
}

type Props = {
  columns: KanbanColumnData[]
  query: {
    q: string
    dateFrom: string
    dateTo: string
    salespersonId: string
  }
  hasActiveFilters: boolean
  currentUserId: string
  currentUserRole: string
  hiddenColumns: Set<string>
}

function toColumnState(columns: KanbanColumnData[]): ColumnState[] {
  return columns.map((c) => ({
    status: c.status,
    total: c.total,
    totalValue: parseFloat(c.totalValue) || 0,
    items: c.items,
  }))
}

export function KanbanBoard({
  columns: initialColumns,
  query,
  hasActiveFilters,
  currentUserId,
  currentUserRole,
  hiddenColumns,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Local optimistic state, re-synced whenever the server sends fresh columns
  const [columns, setColumns] = useState<ColumnState[]>(() => toColumnState(initialColumns))
  useEffect(() => {
    setColumns(toColumnState(initialColumns))
  }, [initialColumns])

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // Win/Loss modal
  const [winLossModal, setWinLossModal] = useState<WinLossModal | null>(null)
  const [isModalPending, setIsModalPending] = useState(false)

  // Duplicate confirmation
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const [isDuplicating, setIsDuplicating] = useState(false)

  // Per-column "Load more"
  const [loadingMoreStatus, setLoadingMoreStatus] = useState<string | null>(null)

  // Mobile active column
  const [mobileColumn, setMobileColumn] = useState(KANBAN_COLUMNS[0].status)

  // Sensors — disable touch drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const allItems = columns.flatMap((c) => c.items)
  const visibleColumns = KANBAN_COLUMNS.filter((col) => !hiddenColumns.has(col.status))
  const boardTotal = columns.reduce((sum, c) => sum + c.total, 0)

  function columnFor(status: string) {
    return columns.find((c) => c.status === status)
  }

  function statusOf(proposalId: string): string | null {
    return columns.find((c) => c.items.some((p) => p.id === proposalId))?.status ?? null
  }

  function moveCard(proposalId: string, fromStatus: string, toStatus: string) {
    setColumns((prev) => {
      const item = prev
        .find((c) => c.status === fromStatus)
        ?.items.find((p) => p.id === proposalId)
      if (!item) return prev
      const value = parseFloat(item.total) || 0
      return prev.map((c) => {
        if (c.status === fromStatus) {
          return {
            ...c,
            total: c.total - 1,
            totalValue: c.totalValue - value,
            items: c.items.filter((p) => p.id !== proposalId),
          }
        }
        if (c.status === toStatus) {
          return {
            ...c,
            total: c.total + 1,
            totalValue: c.totalValue + value,
            items: [{ ...item, status: toStatus }, ...c.items],
          }
        }
        return c
      })
    })
  }

  async function handleLoadMore(status: string) {
    const col = columnFor(status)
    if (!col || loadingMoreStatus) return
    setLoadingMoreStatus(status)
    try {
      const { items } = await getKanbanColumnPage(status, query, col.items.length)
      setColumns((prev) =>
        prev.map((c) =>
          c.status === status
            ? {
                ...c,
                items: [
                  ...c.items,
                  ...items.filter((n) => !c.items.some((e) => e.id === n.id)),
                ],
              }
            : c,
        ),
      )
    } catch {
      toast({ title: 'Failed to load more proposals', variant: 'destructive' })
    } finally {
      setLoadingMoreStatus(null)
    }
  }

  if (boardTotal === 0 && !hasActiveFilters) return <EmptyBoard />

  const allFilteredEmpty = boardTotal === 0 && hasActiveFilters

  // ─── DnD handlers ────────────────────────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string)
  }

  function handleDragOver({ over }: DragOverEvent) {
    setOverId(over ? (over.id as string) : null)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    setOverId(null)

    if (!over) return

    const fromStatus = (active.data.current as { status: string }).status
    const toStatus = over.id as string

    if (fromStatus === toStatus) return

    const targetCol = KANBAN_COLUMNS.find((c) => c.status === toStatus)
    if (!targetCol) return

    if (!targetCol.dropAllowed) {
      toast({
        title: "Can't move here",
        description: targetCol.dropBlockedReason ?? 'This column does not accept drops.',
        variant: 'destructive',
      })
      return
    }

    if (targetCol.allowedFrom && !targetCol.allowedFrom.includes(fromStatus)) {
      const fromLabel = KANBAN_COLUMNS.find((c) => c.status === fromStatus)?.label ?? fromStatus
      const toLabel = targetCol.label
      let reason = `A proposal cannot move directly from ${fromLabel} to ${toLabel}.`
      if (toStatus === 'WON') reason = 'A proposal must be Sent before it can be marked Won.'
      if (toStatus === 'ON_HOLD')
        reason = 'Only Draft, Approved, or Sent proposals can be put on hold.'
      toast({
        title: `Can't move from ${fromLabel} to ${toLabel}`,
        description: reason,
        variant: 'destructive',
      })
      return
    }

    const proposalId = active.id as string

    // WON / LOST: open modal, no optimistic move
    if (toStatus === 'WON' || toStatus === 'LOST') {
      setWinLossModal({ proposalId, type: toStatus })
      return
    }

    // Optimistic update
    const previous = columns
    moveCard(proposalId, fromStatus, toStatus)

    startTransition(async () => {
      let result: { success: true } | { error: string }

      if (toStatus === 'SENT') {
        result = await markAsSent(proposalId)
      } else if (toStatus === 'ON_HOLD') {
        result = await markOnHold(proposalId)
      } else if (toStatus === 'DRAFT') {
        result = await revertToDraft(proposalId)
      } else {
        return
      }

      if ('error' in result) {
        setColumns(previous)
        toast({ title: 'Move failed', description: result.error, variant: 'destructive' })
      } else {
        router.refresh()
      }
    })
  }

  // ─── Win/Loss confirm ─────────────────────────────────────────────────────

  function handleWinLossConfirm({
    signedDate,
    lostReason,
  }: {
    signedDate?: string
    lostReason?: string
  }) {
    if (!winLossModal) return
    const { proposalId, type } = winLossModal
    setIsModalPending(true)

    startTransition(async () => {
      const result =
        type === 'WON'
          ? await markAsWon(proposalId, signedDate)
          : await markAsLost(proposalId, lostReason ?? '')

      setIsModalPending(false)
      if ('error' in result) {
        toast({ title: 'Action failed', description: result.error, variant: 'destructive' })
      } else {
        setWinLossModal(null)
        router.refresh()
      }
    })
  }

  function runStatusMove(
    id: string,
    toStatus: string,
    action: (id: string) => Promise<{ success: true } | { error: string }>,
  ) {
    const fromStatus = statusOf(id)
    const previous = columns
    if (fromStatus) moveCard(id, fromStatus, toStatus)
    startTransition(async () => {
      const result = await action(id)
      if ('error' in result) {
        setColumns(previous)
        toast({ title: 'Failed', description: result.error, variant: 'destructive' })
      } else {
        router.refresh()
      }
    })
  }

  function handleMarkAsSent(id: string) {
    runStatusMove(id, 'SENT', markAsSent)
  }

  function handleMarkOnHold(id: string) {
    runStatusMove(id, 'ON_HOLD', markOnHold)
  }

  function confirmDuplicate() {
    if (!duplicateId) return
    setIsDuplicating(true)
    startTransition(async () => {
      const result = await duplicateProposal(duplicateId)
      setIsDuplicating(false)
      // On success, duplicateProposal redirects to the new draft
      if (result && 'error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
        setDuplicateId(null)
      }
    })
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  function renderColumn(col: (typeof KANBAN_COLUMNS)[number], isOver: boolean) {
    const state = columnFor(col.status)
    const items = state?.items ?? []
    const totalCount = state?.total ?? 0
    return (
      <KanbanColumn
        key={col.status}
        column={col}
        proposals={items}
        totalCount={totalCount}
        totalValue={state?.totalValue ?? 0}
        hasMore={items.length < totalCount}
        isLoadingMore={loadingMoreStatus === col.status}
        onLoadMore={() => handleLoadMore(col.status)}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        isOver={isOver}
        onWinLossModal={(id, type) => setWinLossModal({ proposalId: id, type })}
        onMarkAsSent={handleMarkAsSent}
        onMarkOnHold={handleMarkOnHold}
        onDuplicate={setDuplicateId}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {allFilteredEmpty && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-600">No proposals match your current filters.</span>
        </div>
      )}

      {/* Mobile tab bar */}
      <MobileTabBar
        activeStatus={mobileColumn}
        visibleColumns={visibleColumns}
        onSelect={setMobileColumn}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Desktop: horizontal scroll board */}
        <div className="hidden md:flex gap-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          {visibleColumns.map((col) => renderColumn(col, overId === col.status))}
        </div>

        {/* Mobile: single column at a time */}
        <div className="md:hidden">
          {visibleColumns
            .filter((col) => col.status === mobileColumn)
            .map((col) => renderColumn(col, false))}
        </div>

        <KanbanDragOverlay
          activeId={activeId}
          proposals={allItems}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />
      </DndContext>

      {/* Win/Loss modal */}
      {winLossModal && (
        <WinLossModal
          modal={winLossModal}
          onClose={() => setWinLossModal(null)}
          onConfirm={handleWinLossConfirm}
          isPending={isModalPending}
        />
      )}

      <ConfirmDialog
        open={duplicateId !== null}
        onOpenChange={(o) => !o && setDuplicateId(null)}
        title="Duplicate proposal?"
        description="This creates a new draft proposal with a new number, copying all line items, pricing, and terms. You'll be taken to the new draft."
        confirmLabel="Duplicate"
        isPending={isDuplicating}
        onConfirm={confirmDuplicate}
      />
    </div>
  )
}
