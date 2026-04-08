'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FileText,
  Plus,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  MoreHorizontal,
  Eye,
  Edit2,
  Copy,
  Download,
  Archive,
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
import type { ProposalListItem } from '@/lib/actions/proposals'
import { buttonVariants } from '@/components/ui/button'

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

type SortField =
  | 'number'
  | 'clientName'
  | 'projectTitle'
  | 'total'
  | 'status'
  | 'createdBy'
  | 'createdAt'
  | 'updatedAt'
  | 'version'

type SortDir = 'asc' | 'desc'

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  proposals: ProposalListItem[]
  salespeople: { id: string; name: string }[]
  currentUserId: string
  currentUserRole: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProposalsClient({ proposals, salespeople, currentUserId, currentUserRole }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Multi-select for bulk PDF
  const canBulkDownload = currentUserRole === 'ADMIN' || currentUserRole === 'SUPER_ADMIN'
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkDownloading, setIsBulkDownloading] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ProposalStatus>>(
    new Set(ALL_STATUSES),
  )
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [salespersonId, setSalespersonId] = useState('all')

  // Sort
  const [sortField, setSortField] = useState<SortField>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleStatus(s: ProposalStatus) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const from = dateFrom ? new Date(dateFrom).getTime() : null
    const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null

    return proposals.filter((p) => {
      if (q && !p.clientName.toLowerCase().includes(q) && !p.projectTitle.toLowerCase().includes(q))
        return false
      if (!selectedStatuses.has(p.status as ProposalStatus)) return false
      if (from && new Date(p.createdAt).getTime() < from) return false
      if (to && new Date(p.createdAt).getTime() > to) return false
      if (salespersonId !== 'all' && p.createdBy.id !== salespersonId) return false
      return true
    })
  }, [proposals, search, selectedStatuses, dateFrom, dateTo, salespersonId])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: string | number
      let bVal: string | number

      switch (sortField) {
        case 'number':
          aVal = a.number
          bVal = b.number
          break
        case 'clientName':
          aVal = a.clientName.toLowerCase()
          bVal = b.clientName.toLowerCase()
          break
        case 'projectTitle':
          aVal = a.projectTitle.toLowerCase()
          bVal = b.projectTitle.toLowerCase()
          break
        case 'total':
          aVal = parseFloat(a.total)
          bVal = parseFloat(b.total)
          break
        case 'status':
          aVal = a.status
          bVal = b.status
          break
        case 'createdBy':
          aVal = a.createdBy.name.toLowerCase()
          bVal = b.createdBy.name.toLowerCase()
          break
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime()
          bVal = new Date(b.createdAt).getTime()
          break
        case 'updatedAt':
          aVal = new Date(a.updatedAt).getTime()
          bVal = new Date(b.updatedAt).getTime()
          break
        case 'version':
          aVal = a.version
          bVal = b.version
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortField, sortDir])

  function canEdit(p: ProposalListItem) {
    if (p.status !== 'DRAFT' && p.status !== 'REVISION_REQUIRED') return false
    if (currentUserRole === 'SALES_EXEC' && p.createdBy.id !== currentUserId) return false
    return true
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateProposal(id)
      if (result && 'error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      }
      // On success, duplicateProposal redirects — router.refresh handles revalidation
    })
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sorted.map((p) => p.id)))
    }
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

  if (proposals.length === 0) {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proposals</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {proposals.length} proposal{proposals.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Link href="/proposals/new" className={buttonVariants()}>
          <Plus className="h-4 w-4 mr-2" />
          New Proposal
        </Link>
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
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[140px]"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[140px]"
              />
            </div>
          </div>
          {salespeople.length > 0 && (
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Salesperson</Label>
              <Select value={salespersonId} onValueChange={setSalespersonId}>
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

        {/* Status checkboxes */}
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

      {/* Mobile card list (< md) */}
      <div className="md:hidden flex flex-col gap-3">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center rounded-xl border border-slate-200 bg-white">
            <FileText className="h-8 w-8 text-slate-300" />
            <p className="text-slate-500 text-sm">No proposals found.</p>
          </div>
        ) : (
          sorted.map((p) => (
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
                        onClick={() => handleDuplicate(p.id)}
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
      </div>

      {/* Desktop table (≥ md) */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white overflow-hidden">
        {sorted.length === 0 ? (
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
                        checked={sorted.length > 0 && selectedIds.size === sorted.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all proposals"
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
                {sorted.map((p, i) => (
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
                            onClick={() => handleDuplicate(p.id)}
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
      </div>

      <p className="text-xs text-slate-400 text-right">
        Showing {sorted.length} of {proposals.length} proposals
      </p>
    </div>
  )
}
