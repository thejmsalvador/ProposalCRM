'use client'

import { useState, useMemo, useTransition, useEffect, useRef } from 'react'
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
} from '@/lib/actions/proposals'
import type { ProposalListItem } from '@/lib/actions/proposals'

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

type Props = {
  proposals: ProposalListItem[]
  currentUserId: string
  currentUserRole: string
  filters: {
    search: string
    dateFrom: string
    dateTo: string
    salespersonId: string
  }
  hiddenColumns: Set<string>
}

export function KanbanBoard({
  proposals: initialProposals,
  currentUserId,
  currentUserRole,
  filters,
  hiddenColumns,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Local optimistic state
  const [proposals, setProposals] = useState(initialProposals)
  useEffect(() => {
    setProposals(initialProposals)
  }, [initialProposals])

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // Win/Loss modal
  const [winLossModal, setWinLossModal] = useState<WinLossModal | null>(null)
  const [isModalPending, setIsModalPending] = useState(false)

  // Mobile active column
  const [mobileColumn, setMobileColumn] = useState(KANBAN_COLUMNS[0].status)

  // Sensors — disable touch drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  // Filtered proposals
  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase()
    const from = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null
    const to = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59').getTime() : null

    return proposals.filter((p) => {
      if (q && !p.clientName.toLowerCase().includes(q) && !p.projectTitle.toLowerCase().includes(q))
        return false
      if (from && new Date(p.createdAt).getTime() < from) return false
      if (to && new Date(p.createdAt).getTime() > to) return false
      if (filters.salespersonId !== 'all' && p.createdBy.id !== filters.salespersonId) return false
      return true
    })
  }, [proposals, filters])

  const visibleColumns = KANBAN_COLUMNS.filter((col) => !hiddenColumns.has(col.status))
  const allEmpty = filtered.length === 0 && initialProposals.length === 0

  if (allEmpty) return <EmptyBoard />

  const allFilteredEmpty = filtered.length === 0 && initialProposals.length > 0

  // ─── DnD handlers ────────────────────────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent) {
    // Block touch/mobile drag
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
    const previous = proposals.map((p) => ({ ...p }))
    setProposals((prev) =>
      prev.map((p) => (p.id === proposalId ? { ...p, status: toStatus } : p)),
    )

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
        setProposals(previous)
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

  function handleMarkAsSent(id: string) {
    const previous = proposals.map((p) => ({ ...p }))
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'SENT' } : p)))
    startTransition(async () => {
      const result = await markAsSent(id)
      if ('error' in result) {
        setProposals(previous)
        toast({ title: 'Failed', description: result.error, variant: 'destructive' })
      } else {
        router.refresh()
      }
    })
  }

  function handleMarkOnHold(id: string) {
    const previous = proposals.map((p) => ({ ...p }))
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'ON_HOLD' } : p)))
    startTransition(async () => {
      const result = await markOnHold(id)
      if ('error' in result) {
        setProposals(previous)
        toast({ title: 'Failed', description: result.error, variant: 'destructive' })
      } else {
        router.refresh()
      }
    })
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateProposal(id)
      if (result && 'error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      }
    })
  }

  // ─── Render ───────────────────────────────────────────────────────────────

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
          {visibleColumns.map((col) => {
            const colProposals = filtered.filter((p) => p.status === col.status)
            return (
              <KanbanColumn
                key={col.status}
                column={col}
                proposals={colProposals}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                activeId={activeId}
                isOver={overId === col.status}
                onWinLossModal={(id, type) => setWinLossModal({ proposalId: id, type })}
                onMarkAsSent={handleMarkAsSent}
                onMarkOnHold={handleMarkOnHold}
                onDuplicate={handleDuplicate}
              />
            )
          })}
        </div>

        {/* Mobile: single column at a time */}
        <div className="md:hidden">
          {visibleColumns
            .filter((col) => col.status === mobileColumn)
            .map((col) => {
              const colProposals = filtered.filter((p) => p.status === col.status)
              return (
                <KanbanColumn
                  key={col.status}
                  column={col}
                  proposals={colProposals}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  activeId={activeId}
                  isOver={false}
                  onWinLossModal={(id, type) => setWinLossModal({ proposalId: id, type })}
                  onMarkAsSent={handleMarkAsSent}
                  onMarkOnHold={handleMarkOnHold}
                  onDuplicate={handleDuplicate}
                />
              )
            })}
        </div>

        <KanbanDragOverlay
          activeId={activeId}
          proposals={proposals}
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
    </div>
  )
}
