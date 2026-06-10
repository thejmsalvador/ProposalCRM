'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  FileText,
  Plus,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Edit2,
  Copy,
  Download,
  Archive,
  List,
  KanbanSquare,
  Columns3,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { duplicateProposal } from '@/lib/actions/proposals'
import type {
  ProposalListItem,
  ProposalsPage,
  KanbanColumnData,
  ProposalSortField,
} from '@/lib/actions/proposals'
import { buttonVariants } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import dynamic from 'next/dynamic'
import { KANBAN_COLUMNS } from '@/components/proposals/kanban/config'

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden pb-4" aria-busy="true" aria-label="Loading board">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="w-[280px] h-[320px] shrink-0 rounded-[12px] bg-slate-100 animate-pulse" />
      ))}
    </div>
  )
}

// dnd-kit + board code only load when the kanban view is active
const KanbanBoard = dynamic(
  () => import('@/components/proposals/kanban/KanbanBoard').then((m) => m.KanbanBoard),
  { ssr: false, loading: () => <BoardSkeleton /> },
)

type ViewMode = 'list' | 'kanban'
const HIDDEN_COLUMNS_KEY = 'kanban_hidden_columns'

// ─── Status config ────────────────────────────────────────────────────────────

type ProposalStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'REVISION_REQUIRED'
  | 'APPROVED'
  | 'SENT'
  | 'WON'
  | 'LOST'
  | 'ON_HOLD'
  | 'EXPIRED'

const ALL_STATUSES: ProposalStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'REVISION_REQUIRED',
  'APPROVED',
  'SENT',
  'WON',
  'LOST',
  'ON_HOLD',
  'EXPIRED',
]

const STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  REVISION_REQUIRED: 'Revision Required',
  APPROVED: 'Approved',
  SENT: 'Sent',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On Hold',
  EXPIRED: 'Expired',
}

const STATUS_STYLES: Record<ProposalStatus, string> = {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: string) {
  const n = parseFloat(value)
  if (isNaN(n)) return '₱0.00'
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ─── Sort types ───────────────────────────────────────────────────────────────

type SortField = ProposalSortField
type SortDir = 'asc' | 'desc'

// ─── Props ────────────────────────────────────────────────────────────────────

type InitialQuery = {
  q: string
  statuses: string[] | null
  dateFrom: string
  dateTo: string
  salespersonId: string
  sort: SortField
  dir: SortDir
}

type Props = {
  view: ViewMode
  listData: ProposalsPage | null
  kanbanColumns: KanbanColumnData[] | null
  salespeople: { id: string; name: string }[]
  currentUserId: string
  currentUserRole: string
  initialQuery: InitialQuery
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProposalsClient({
  view,
  listData,
  kanbanColumns,
  salespeople,
  currentUserId,
  currentUserRole,
  initialQuery,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // ─── URL helpers — the URL is the source of truth for filters/sort/page ─────

  const pushQuery = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') params.delete(key)
        else params.set(key, value)
      }
      const qs = params.toString()
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
      })
    },
    [searchParams, pathname, router],
  )

  function switchView(mode: ViewMode) {
    // Cookie lets the server default correctly on a bare /proposals visit
    document.cookie = `proposals_view=${mode}; path=/; max-age=31536000; samesite=lax`
    pushQuery({ view: mode === 'kanban' ? 'kanban' : null, page: null })
  }

  // ─── Filter inputs (locally controlled, synced to URL) ──────────────────────

  const [search, setSearch] = useState(initialQuery.q)
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ProposalStatus>>(
    new Set((initialQuery.statuses as ProposalStatus[] | null) ?? ALL_STATUSES),
  )
  const [dateFrom, setDateFrom] = useState(initialQuery.dateFrom)
  const [dateTo, setDateTo] = useState(initialQuery.dateTo)
  const [salespersonId, setSalespersonId] = useState(initialQuery.salespersonId)

  // Debounced search → URL (skips when URL already matches, e.g. on mount)
  useEffect(() => {
    const current = searchParams.get('q') ?? ''
    if (search.trim() === current) return
    const t = setTimeout(() => pushQuery({ q: search.trim() || null, page: null }), 300)
    return () => clearTimeout(t)
  }, [search, searchParams, pushQuery])

  function toggleStatus(s: ProposalStatus) {
    const next = new Set(selectedStatuses)
    if (next.has(s)) next.delete(s)
    else next.add(s)
    setSelectedStatuses(next)
    pushQuery({
      status:
        next.size === 0 || next.size === ALL_STATUSES.length
          ? null
          : Array.from(next).join(','),
      page: null,
    })
  }

  function changeDateFrom(value: string) {
    setDateFrom(value)
    pushQuery({ from: value || null, page: null })
  }

  function changeDateTo(value: string) {
    setDateTo(value)
    pushQuery({ to: value || null, page: null })
  }

  function changeSalesperson(value: string) {
    setSalespersonId(value)
    pushQuery({ sp: value === 'all' ? null : value, page: null })
  }

  // ─── Sort (server-side; current value comes from the URL via props) ─────────

  const sortField = initialQuery.sort
  const sortDir = initialQuery.dir

  function handleSort(field: SortField) {
    const nextDir: SortDir = sortField === field ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc'
    pushQuery({ sort: field, dir: nextDir, page: null })
  }

  // ─── Pagination ──────────────────────────────────────────────────────────────

  const items = listData?.items ?? []
  const total = listData?.total ?? 0
  const page = listData?.page ?? 1
  const pageSize = listData?.pageSize ?? 50
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function goToPage(p: number) {
    pushQuery({ page: p > 1 ? String(p) : null })
  }

  const hasActiveFilters = Boolean(
    initialQuery.q ||
      initialQuery.statuses ||
      initialQuery.dateFrom ||
      initialQuery.dateTo ||
      initialQuery.salespersonId !== 'all',
  )

  const grandTotal =
    view === 'list' ? total : (kanbanColumns ?? []).reduce((sum, c) => sum + c.total, 0)

  // Hidden columns for kanban
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HIDDEN_COLUMNS_KEY)
      if (saved) setHiddenColumns(new Set(JSON.parse(saved)))
    } catch {}
  }, [])
  function toggleColumn(status: string) {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(Array.from(next)))
      return next
    })
  }

  // Multi-select for bulk PDF
  const canBulkDownload = currentUserRole === 'ADMIN' || currentUserRole === 'SUPER_ADMIN'
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkDownloading, setIsBulkDownloading] = useState(false)

  function canEdit(p: ProposalListItem) {
    if (p.status !== 'DRAFT' && p.status !== 'REVISION_REQUIRED') return false
    if (currentUserRole === 'SALES_EXEC' && p.createdBy.id !== currentUserId) return false
    return true
  }

  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const [isDuplicating, setIsDuplicating] = useState(false)

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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const pageIds = items.map((p) => p.id)
    const allSelected = pageIds.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      pageIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)))
      return next
    })
  }

  async function handleBulkDownload() {
    if (selectedIds.size === 0) return
    setIsBulkDownloading(true)
    try {
      const res = await fetch('/api/pdf/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalIds: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast({
          title: 'Download failed',
          description: data.error ?? 'Could not generate ZIP',
          variant: 'destructive',
        })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `proposals-${new Date().toISOString().split('T')[0]}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: `${selectedIds.size} PDF${selectedIds.size > 1 ? 's' : ''} downloaded` })
      setSelectedIds(new Set())
    } catch {
      toast({ title: 'Download failed', description: 'Network error.', variant: 'destructive' })
    } finally {
      setIsBulkDownloading(false)
    }
  }

  // ─── Sort icon ──────────────────────────────────────────────────────────────

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronsUpDown className="ml-1 h-3 w-3 text-slate-400" />
    return sortDir === 'asc' ? (
      <ChevronUp className="ml-1 h-3 w-3 text-indigo-600" />
    ) : (
      <ChevronDown className="ml-1 h-3 w-3 text-indigo-600" />
    )
  }

  function SortButton({
    field,
    children,
    className = '',
  }: {
    field: SortField
    children: React.ReactNode
    className?: string
  }) {
    return (
      <button
        onClick={() => handleSort(field)}
        className={`flex items-center whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800 ${className}`}
      >
        {children}
        <SortIcon field={field} />
      </button>
    )
  }

  // ─── Empty states ────────────────────────────────────────────────────────────

  if (grandTotal === 0 && !hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
          <FileText className="h-8 w-8 text-indigo-400" />
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-800">No proposals yet</p>
          <p className="text-sm text-slate-500 mt-1">Get started by creating your first proposal.</p>
        </div>
        <Link href="/proposals/new" className={buttonVariants()}>
          <Plus className="h-4 w-4 mr-2" />
          Create your first proposal
        </Link>
      </div>
    )
  }

  // ─── Main layout ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proposals</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {grandTotal} proposal{grandTotal !== 1 ? 's' : ''}
            {hasActiveFilters ? ' matching filters' : ' total'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
            <button
              onClick={() => switchView('list')}
              className={[
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors min-h-[36px]',
                view === 'list'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
              aria-label="List view"
              aria-pressed={view === 'list'}
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => switchView('kanban')}
              className={[
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors min-h-[36px] border-l border-slate-200',
                view === 'kanban'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
              aria-label="Kanban view"
              aria-pressed={view === 'kanban'}
            >
              <KanbanSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Board</span>
            </button>
          </div>
          <Link href="/proposals/new" className={buttonVariants({ className: 'gap-2 min-h-[44px]' })}>
            <Plus size={16} aria-hidden="true" />
            New Proposal
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-4">
        {/* Top row: search + date range + salesperson */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search client or project…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => changeDateFrom(e.target.value)}
                className="w-[140px]"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => changeDateTo(e.target.value)}
                className="w-[140px]"
              />
            </div>
          </div>
          {salespeople.length > 0 && (
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Salesperson</Label>
              <Select value={salespersonId} onValueChange={changeSalesperson}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All salespeople" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All salespeople</SelectItem>
                  {salespeople.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Status checkboxes — list view only */}
        {view === 'list' && (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ALL_STATUSES.map((s) => (
              <label key={s} className="flex items-center gap-1.5 cursor-pointer select-none">
                <Checkbox
                  checked={selectedStatuses.has(s)}
                  onCheckedChange={() => toggleStatus(s)}
                  id={`status-${s}`}
                />
                <span className="text-sm text-slate-700">{STATUS_LABELS[s]}</span>
              </label>
            ))}
          </div>
        )}

        {/* Kanban: hide columns dropdown */}
        {view === 'kanban' && (
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Columns3 className="h-4 w-4" />
                  Columns ({KANBAN_COLUMNS.length - hiddenColumns.size})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {KANBAN_COLUMNS.map((col) => (
                  <DropdownMenuItem
                    key={col.status}
                    onClick={(e) => {
                      e.preventDefault()
                      toggleColumn(col.status)
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={!hiddenColumns.has(col.status)}
                      onCheckedChange={() => toggleColumn(col.status)}
                      id={`col-${col.status}`}
                      aria-label={`Toggle ${col.label} column`}
                    />
                    <span className="text-sm">{col.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {hiddenColumns.size > 0 && (
              <button
                onClick={() => {
                  setHiddenColumns(new Set())
                  localStorage.removeItem(HIDDEN_COLUMNS_KEY)
                }}
                className="text-xs text-indigo-600 hover:underline"
              >
                Show all columns
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {canBulkDownload && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <span className="text-sm font-medium text-indigo-800">
            {selectedIds.size} proposal{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <Button
            size="sm"
            onClick={handleBulkDownload}
            disabled={isBulkDownloading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Archive className="h-4 w-4 mr-1.5" />
            {isBulkDownloading ? 'Preparing ZIP…' : `Download ${selectedIds.size} PDF${selectedIds.size > 1 ? 's' : ''} as ZIP`}
          </Button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-indigo-600 hover:underline ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Kanban board view */}
      {view === 'kanban' && kanbanColumns && (
        <div className={isPending ? 'opacity-60 transition-opacity' : ''}>
          <KanbanBoard
            columns={kanbanColumns}
            query={{
              q: initialQuery.q,
              dateFrom: initialQuery.dateFrom,
              dateTo: initialQuery.dateTo,
              salespersonId: initialQuery.salespersonId,
            }}
            hasActiveFilters={hasActiveFilters}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            hiddenColumns={hiddenColumns}
          />
        </div>
      )}

      {/* List view — mobile card list (< md) */}
      {view === 'list' && <div className={`md:hidden flex flex-col gap-3 ${isPending ? 'opacity-60 transition-opacity' : ''}`}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center rounded-xl border border-slate-200 bg-white">
            <FileText className="h-8 w-8 text-slate-300" />
            <p className="text-slate-500 text-sm">No proposals found.</p>
          </div>
        ) : (
          items.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-2"
            >
              {/* Top row: proposal number + status + actions menu */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1 min-w-0">
                  <Link
                    href={`/proposals/${p.id}`}
                    className="font-mono text-xs text-indigo-700 hover:underline font-semibold"
                  >
                    {p.number}
                  </Link>
                  <span
                    className={`inline-flex items-center self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[p.status as ProposalStatus] ?? 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {STATUS_LABELS[p.status as ProposalStatus] ?? p.status}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {canBulkDownload && (
                    <Checkbox
                      checked={selectedIds.has(p.id)}
                      onCheckedChange={() => toggleSelect(p.id)}
                      aria-label={`Select proposal ${p.number}`}
                    />
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        aria-label={`Actions for proposal ${p.number}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => router.push(`/proposals/${p.id}`)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </DropdownMenuItem>
                      {canEdit(p) && (
                        <DropdownMenuItem
                          onClick={() => router.push(`/proposals/${p.id}/edit`)}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Edit2 className="h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => setDuplicateId(p.id)}
                        className="flex items-center gap-2"
                      >
                        <Copy className="h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={p.status !== 'APPROVED'}
                        className="flex items-center gap-2"
                        onClick={() => {
                          if (p.status === 'APPROVED') router.push(`/proposals/${p.id}?action=pdf`)
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Download PDF
                        {p.status !== 'APPROVED' && (
                          <span className="ml-auto text-xs text-slate-400">Approved only</span>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Client + project */}
              <div>
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {p.clientName || <span className="text-slate-400 italic">Untitled</span>}
                </p>
                <p className="text-xs text-slate-500 truncate">{p.projectTitle}</p>
              </div>

              {/* Total + date */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-800">{formatCurrency(p.total)}</span>
                <span className="text-xs text-slate-400">{formatDate(p.createdAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>}

      {/* List view — Desktop table (≥ md) */}
      {view === 'list' && <div className={`hidden md:block rounded-xl border border-slate-200 bg-white overflow-hidden ${isPending ? 'opacity-60 transition-opacity' : ''}`}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <FileText className="h-8 w-8 text-slate-300" />
            <p className="text-slate-500 text-sm">No proposals found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {canBulkDownload && (
                    <th className="px-4 py-3 text-left w-10">
                      <Checkbox
                        checked={items.length > 0 && items.every((p) => selectedIds.has(p.id))}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all proposals on this page"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left">
                    <SortButton field="number">Proposal #</SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="clientName">Client</SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="projectTitle">Project</SortButton>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <SortButton field="total" className="ml-auto">
                      Total
                    </SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="status">Status</SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="createdBy">Salesperson</SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="createdAt">Created</SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="updatedAt">Modified</SortButton>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <SortButton field="version" className="mx-auto">
                      Ver
                    </SortButton>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                      i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                    }`}
                  >
                    {canBulkDownload && (
                      <td className="px-4 py-3 w-10">
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                          aria-label={`Select proposal ${p.number}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 font-mono text-xs text-indigo-700 whitespace-nowrap">
                      <Link href={`/proposals/${p.id}`} className="hover:underline">
                        {p.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-800 max-w-[160px] truncate">
                      {p.clientName || <span className="text-slate-400 italic">Untitled</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">
                      {p.projectTitle}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                      {formatCurrency(p.total)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                          STATUS_STYLES[p.status as ProposalStatus] ?? 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {STATUS_LABELS[p.status as ProposalStatus] ?? p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {p.createdBy.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {formatDate(p.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500 text-xs">v{p.version}</td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label="Row actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/proposals/${p.id}`)}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          {canEdit(p) && (
                            <DropdownMenuItem
                              onClick={() => router.push(`/proposals/${p.id}/edit`)}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Edit2 className="h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => setDuplicateId(p.id)}
                            className="flex items-center gap-2"
                          >
                            <Copy className="h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={p.status !== 'APPROVED'}
                            className="flex items-center gap-2"
                            title={
                              p.status !== 'APPROVED' ? 'Available once Approved' : undefined
                            }
                            onClick={() => {
                              if (p.status === 'APPROVED') {
                                router.push(`/proposals/${p.id}?action=pdf`)
                              }
                            }}
                          >
                            <Download className="h-4 w-4" />
                            Download PDF
                            {p.status !== 'APPROVED' && (
                              <span className="ml-auto text-xs text-slate-400">Approved only</span>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* Pagination */}
      {view === 'list' && total > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-400">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}{' '}
            proposal{total !== 1 ? 's' : ''}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1 || isPending}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-xs text-slate-500 tabular-nums">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages || isPending}
                aria-label="Next page"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
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
