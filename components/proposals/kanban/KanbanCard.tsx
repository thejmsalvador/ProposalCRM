'use client'

import { useRouter } from 'next/navigation'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  MoreHorizontal,
  Eye,
  Edit2,
  Copy,
  Download,
  ExternalLink,
  PauseCircle,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ProposalListItem } from '@/lib/actions/proposals'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: string) {
  const n = parseFloat(value)
  if (isNaN(n)) return '₱0'
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function getExpiryInfo(validUntil: string): {
  label: string
  color: string
} {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(validUntil)
  expiry.setHours(0, 0, 0, 0)
  const diffMs = expiry.getTime() - today.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return {
      label: `Expired ${expiry.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`,
      color: 'text-red-600',
    }
  }
  if (diffDays <= 7) {
    return {
      label: `Expires in ${diffDays}d`,
      color: 'text-amber-600',
    }
  }
  return {
    label: `Valid until ${expiry.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`,
    color: 'text-slate-400',
  }
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  proposal: ProposalListItem
  currentUserId: string
  currentUserRole: string
  isDragOverlay?: boolean
  onWinLossModal?: (id: string, type: 'WON' | 'LOST') => void
  onMarkAsSent?: (id: string) => void
  onMarkOnHold?: (id: string) => void
  onDuplicate?: (id: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KanbanCard({
  proposal,
  currentUserId,
  currentUserRole,
  isDragOverlay = false,
  onWinLossModal,
  onMarkAsSent,
  onMarkOnHold,
  onDuplicate,
}: Props) {
  const router = useRouter()

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: proposal.id,
    data: { status: proposal.status },
    disabled: isDragOverlay,
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  const canEdit =
    (proposal.status === 'DRAFT' || proposal.status === 'REVISION_REQUIRED') &&
    (currentUserRole !== 'SALES_EXEC' || proposal.createdBy.id === currentUserId)

  const expiry = getExpiryInfo(proposal.validUntil)

  const showMarkAsSent = proposal.status === 'APPROVED'
  const showMarkAsWon = proposal.status === 'SENT'
  const showMarkAsLost = proposal.status === 'SENT' || proposal.status === 'APPROVED'
  const showOnHold = ['DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUIRED', 'APPROVED', 'SENT'].includes(
    proposal.status,
  )

  if (isDragging && !isDragOverlay) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="rounded-[8px] border-2 border-dashed border-slate-300 bg-slate-50 h-[132px]"
      />
    )
  }

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={isDragOverlay ? undefined : style}
      {...(isDragOverlay ? {} : listeners)}
      {...(isDragOverlay ? {} : attributes)}
      className={[
        'bg-white rounded-[8px] border border-slate-200 shadow-sm flex flex-col gap-2 p-3 select-none',
        isDragOverlay
          ? 'opacity-90 shadow-xl cursor-grabbing rotate-[1deg]'
          : 'hover:shadow-md cursor-grab',
      ].join(' ')}
    >
      {/* Top row: number + menu */}
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[10px] text-slate-400 tracking-tight truncate">
          {proposal.number}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 shrink-0 text-slate-400 hover:text-slate-700"
              aria-label={`Actions for ${proposal.number}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={() => router.push(`/proposals/${proposal.id}`)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Eye className="h-4 w-4" />
              View Details
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem
                onClick={() => router.push(`/proposals/${proposal.id}/edit`)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Edit2 className="h-4 w-4" />
                Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => onDuplicate?.(proposal.id)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Copy className="h-4 w-4" />
              Duplicate
            </DropdownMenuItem>

            {/* Quick status actions */}
            {showMarkAsSent && (
              <DropdownMenuItem
                onClick={() => onMarkAsSent?.(proposal.id)}
                className="flex items-center gap-2 cursor-pointer"
              >
                Mark as Sent
              </DropdownMenuItem>
            )}
            {showMarkAsWon && (
              <DropdownMenuItem
                onClick={() => onWinLossModal?.(proposal.id, 'WON')}
                className="flex items-center gap-2 cursor-pointer text-green-700"
              >
                Mark as Won
              </DropdownMenuItem>
            )}
            {showMarkAsLost && (
              <DropdownMenuItem
                onClick={() => onWinLossModal?.(proposal.id, 'LOST')}
                className="flex items-center gap-2 cursor-pointer text-red-600"
              >
                Mark as Lost
              </DropdownMenuItem>
            )}
            {showOnHold && (
              <DropdownMenuItem
                onClick={() => onMarkOnHold?.(proposal.id)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <PauseCircle className="h-4 w-4" />
                Put on Hold
              </DropdownMenuItem>
            )}

            <DropdownMenuItem
              disabled={!proposal.pdfUrl}
              className="flex items-center gap-2"
              title={!proposal.pdfUrl ? 'Generate PDF first' : undefined}
              onClick={() => {
                if (proposal.pdfUrl) {
                  window.open(proposal.pdfUrl, '_blank')
                }
              }}
            >
              <Download className="h-4 w-4" />
              Download PDF
              {!proposal.pdfUrl && (
                <span className="ml-auto text-[10px] text-slate-400">Generate first</span>
              )}
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => window.open(`/proposals/${proposal.id}`, '_blank')}
              className="flex items-center gap-2 cursor-pointer"
            >
              <ExternalLink className="h-4 w-4" />
              Open in new tab
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Client name */}
      <button
        className="text-left"
        onClick={() => router.push(`/proposals/${proposal.id}`)}
        tabIndex={-1}
      >
        <p className="text-sm font-semibold text-slate-800 truncate leading-tight">
          {proposal.clientName || <span className="text-slate-400 italic">Untitled</span>}
        </p>
        <p className="text-xs text-slate-500 line-clamp-2 leading-snug mt-0.5">
          {proposal.projectTitle}
        </p>
      </button>

      {/* Deal value */}
      <p
        className={[
          'text-sm font-bold text-right',
          proposal.status === 'WON' ? 'text-green-600' : 'text-slate-800',
        ].join(' ')}
      >
        {formatCurrency(proposal.total)}
      </p>

      {/* Footer */}
      <div className="border-t border-slate-100 pt-2 flex items-center justify-between gap-2">
        {/* Salesperson */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="h-5 w-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[9px] font-bold shrink-0">
            {getInitials(proposal.createdBy.name)}
          </div>
          <span className="text-[10px] text-slate-500 truncate">{proposal.createdBy.name}</span>
        </div>
        {/* Expiry */}
        <span className={`text-[10px] shrink-0 ${expiry.color}`}>{expiry.label}</span>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function KanbanCardSkeleton({ height = 132 }: { height?: number }) {
  return (
    <div
      className="bg-white rounded-[8px] border border-slate-200 p-3 flex flex-col gap-2"
      style={{ height }}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-4 w-16 ml-auto" />
      <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  )
}
