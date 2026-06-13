'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  MoreHorizontal,
  Archive,
  RotateCcw,
  ExternalLink,
  Pencil,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { archiveService, restoreService, bulkArchiveServices, bulkRestoreServices } from '@/lib/actions/catalog'
import type { ServiceListItem } from '@/lib/actions/catalog'
import { formatCurrency } from '@/lib/validations/proposals'
import { engagementLabel } from '@/lib/validations/catalog'

type SortKey = 'name' | 'category' | 'unit' | 'engagementTerm' | 'defaultRate' | 'itemTotal' | 'status'
type SortDir = 'asc' | 'desc'

function itemTotalOf(s: ServiceListItem) {
  return parseFloat(s.defaultRate) * s.engagementTerm
}

const PAGE_SIZE = 25

type Props = {
  services: ServiceListItem[]
  onEdit: (service: ServiceListItem) => void
}

export function CatalogTableView({ services, onEdit }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  const sorted = useMemo(() => {
    return [...services].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (sortKey) {
        case 'name': av = a.name; bv = b.name; break
        case 'category': av = a.category; bv = b.category; break
        case 'unit': av = engagementLabel(a.unit); bv = engagementLabel(b.unit); break
        case 'engagementTerm': av = a.engagementTerm; bv = b.engagementTerm; break
        case 'defaultRate': av = parseFloat(a.defaultRate); bv = parseFloat(b.defaultRate); break
        case 'itemTotal': av = itemTotalOf(a); bv = itemTotalOf(b); break
        case 'status': av = a.isActive ? 0 : 1; bv = b.isActive ? 0 : 1; break
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [services, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const allFilteredSelected = selected.size === sorted.length && sorted.length > 0
  const someSelected = selected.size > 0

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(sorted.map((s) => s.id)))
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Archive needs confirmation; restore is the safe direction and stays direct
  const [archiveTarget, setArchiveTarget] = useState<{ kind: 'row'; id: string } | { kind: 'bulk' } | null>(null)
  const [isArchiving, setIsArchiving] = useState(false)

  async function confirmArchive() {
    if (!archiveTarget) return
    setIsArchiving(true)
    try {
      if (archiveTarget.kind === 'row') {
        const result = await archiveService(archiveTarget.id)
        if ('error' in result) {
          toast({ title: 'Error', description: result.error, variant: 'destructive' })
        } else {
          toast({ title: 'Service archived' })
        }
      } else {
        const ids = Array.from(selected).filter((id) => {
          const svc = services.find((s) => s.id === id)
          return svc?.isActive
        })
        if (ids.length > 0) {
          const result = await bulkArchiveServices(ids)
          if ('error' in result) {
            toast({ title: 'Error', description: result.error, variant: 'destructive' })
          } else {
            toast({ title: `${result.count} service${result.count !== 1 ? 's' : ''} archived` })
            setSelected(new Set())
          }
        }
      }
    } finally {
      setIsArchiving(false)
      setArchiveTarget(null)
    }
  }

  async function handleBulkRestore() {
    const ids = Array.from(selected).filter((id) => {
      const svc = services.find((s) => s.id === id)
      return !svc?.isActive
    })
    if (ids.length === 0) return
    const result = await bulkRestoreServices(ids)
    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: `${result.count} service${result.count !== 1 ? 's' : ''} restored` })
      setSelected(new Set())
    }
  }

  async function handleRowRestore(id: string) {
    const result = await restoreService(id)
    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Service restored' })
    }
  }

  const selectedActive = Array.from(selected).filter((id) => services.find((s) => s.id === id)?.isActive)
  const selectedArchived = Array.from(selected).filter((id) => !services.find((s) => s.id === id)?.isActive)

  return (
    <div className="flex flex-col gap-3">
      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--color-accent-light)] border border-[var(--color-accent)] text-sm">
          <span className="text-[var(--color-accent)] font-medium">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          {selectedActive.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white min-h-[36px]"
              onClick={() => setArchiveTarget({ kind: 'bulk' })}
            >
              <Archive size={14} />
              Archive {selectedActive.length} active
            </Button>
          )}
          {selectedArchived.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 border-green-600 text-green-700 hover:bg-green-600 hover:text-white min-h-[36px]"
              onClick={handleBulkRestore}
            >
              <RotateCcw size={14} />
              Restore {selectedArchived.length} archived
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-[36px]"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  aria-label="Select all services"
                />
              </TableHead>
              <SortableHead label="Service Name" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableHead label="Service Category" sortKey="category" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableHead label="Engagement Type" sortKey="unit" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableHead label="Term" sortKey="engagementTerm" current={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
              <SortableHead label="Item Cost" sortKey="defaultRate" current={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
              <SortableHead label="Item Total" sortKey="itemTotal" current={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
              <SortableHead label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={handleSort} />
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-[var(--color-muted)]">
                  No services match your filters.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((svc) => (
                <TableRow
                  key={svc.id}
                  data-state={selected.has(svc.id) ? 'selected' : undefined}
                  className={!svc.isActive ? 'opacity-60' : ''}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                      checked={selected.has(svc.id)}
                      onChange={() => toggleRow(svc.id)}
                      aria-label={`Select ${svc.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/catalog/${svc.id}`}
                      className="font-semibold text-[var(--color-primary)] hover:text-[var(--color-accent)] hover:underline"
                    >
                      {svc.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-[var(--color-primary)]">{svc.category}</TableCell>
                  <TableCell className="text-sm text-[var(--color-muted)]">{engagementLabel(svc.unit)}</TableCell>
                  <TableCell className="text-right tabular-nums text-[var(--color-muted)]">{svc.engagementTerm}</TableCell>
                  <TableCell className="text-right tabular-nums text-[var(--color-muted)]">
                    {formatCurrency(parseFloat(svc.defaultRate))}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(itemTotalOf(svc))}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        svc.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {svc.isActive ? 'Active' : 'Archived'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label={`Actions for ${svc.name}`}
                        >
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => onEdit(svc)} className="gap-2">
                          <Pencil size={14} /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="gap-2">
                          <Link href={`/catalog/${svc.id}`}>
                            <ExternalLink size={14} /> View detail
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {svc.isActive ? (
                          <DropdownMenuItem
                            onClick={() => setArchiveTarget({ kind: 'row', id: svc.id })}
                            className="gap-2 text-[var(--color-danger)] focus:text-[var(--color-danger)]"
                          >
                            <Archive size={14} /> Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleRowRestore(svc.id)}
                            className="gap-2 text-green-700 focus:text-green-700"
                          >
                            <RotateCcw size={14} /> Restore
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[var(--color-muted)]">
          <span>
            {sorted.length} result{sorted.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[36px]"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="px-2 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[36px]"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        title={
          archiveTarget?.kind === 'bulk'
            ? `Archive ${selectedActive.length} service${selectedActive.length !== 1 ? 's' : ''}?`
            : 'Archive service?'
        }
        description="Archived services are hidden from the proposal wizard but stay linked to existing proposals. You can restore them at any time."
        confirmLabel="Archive"
        destructive
        isPending={isArchiving}
        onConfirm={confirmArchive}
      />
    </div>
  )
}

function SortableHead({
  label,
  sortKey,
  current,
  dir,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = current === sortKey
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 font-medium hover:text-[var(--color-primary)] transition-colors ${
          active ? 'text-[var(--color-primary)]' : ''
        }`}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ChevronUp size={13} className="shrink-0" />
          ) : (
            <ChevronDown size={13} className="shrink-0" />
          )
        ) : (
          <ChevronsUpDown size={13} className="shrink-0 opacity-40" />
        )}
      </button>
    </TableHead>
  )
}
