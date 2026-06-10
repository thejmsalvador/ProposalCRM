'use client'

import { useState, useMemo, useTransition, useEffect } from 'react'
import Link from 'next/link'
import {
  Package,
  Plus,
  Search,
  Archive,
  ChevronRight,
  LayoutGrid,
  List,
  Upload,
  Download,
  ChevronDown,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { bulkArchiveServices } from '@/lib/actions/catalog'
import type { ServiceListItem, TemplateOption } from '@/lib/actions/catalog'
import { ServiceSheet } from './ServiceSheet'
import { CatalogTableView } from './CatalogTableView'
import { ImportCsvSheet } from './ImportCsvSheet'

function formatRate(rate: string) {
  const n = parseFloat(rate)
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type Props = {
  services: ServiceListItem[]
  categories: string[]
  paymentTemplates: TemplateOption[]
  tcTemplates: TemplateOption[]
  canImport: boolean
}

type StatusFilter = 'all' | 'active' | 'archived'
type ViewMode = 'grid' | 'table'

const VIEW_PREF_KEY = 'catalog_view_preference'

export function CatalogClient({ services, categories, paymentTemplates, tcTemplates, canImport }: Props) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceListItem | null>(null)
  const [importSheetOpen, setImportSheetOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [, startTransition] = useTransition()

  // Load persisted view preference (client only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_PREF_KEY)
      if (stored === 'table' || stored === 'grid') {
        setViewMode(stored)
      }
    } catch {
      // localStorage unavailable
    }
  }, [])

  function switchView(mode: ViewMode) {
    if (mode === 'table' && window.innerWidth < 640) {
      toast({
        title: 'Table view is optimized for larger screens.',
        description: 'Switch to card view on mobile.',
      })
      return
    }
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_PREF_KEY, mode)
    } catch {
      // ignore
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return services.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.category.toLowerCase().includes(q)) return false
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false
      if (statusFilter === 'active' && !s.isActive) return false
      if (statusFilter === 'archived' && s.isActive) return false
      return true
    })
  }, [services, search, categoryFilter, statusFilter])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((s) => s.id)))
    }
  }

  function handleBulkArchive() {
    const ids = Array.from(selected)
    startTransition(async () => {
      const result = await bulkArchiveServices(ids)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: `${result.count} service${result.count !== 1 ? 's' : ''} archived` })
        setSelected(new Set())
      }
    })
  }

  function openAdd() {
    setEditingService(null)
    setSheetOpen(true)
  }

  function openEdit(service: ServiceListItem) {
    setEditingService(service)
    setSheetOpen(true)
  }

  function downloadTemplate(format: 'csv' | 'xlsx') {
    window.location.href = `/api/catalog/template?format=${format}`
  }

  const allActiveCategories = Array.from(new Set(services.map((s) => s.category))).sort()
  const activeSelected = filtered.filter((s) => s.isActive && selected.has(s.id))

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Service Catalog</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {services.filter((s) => s.isActive).length} active services
          </p>
        </div>
        <Button type="button" className="gap-2 min-h-[44px]" onClick={openAdd}>
          <Plus size={16} aria-hidden="true" />
          Add Service
        </Button>
      </div>

      {/* Toolbar: filters + import + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
            aria-hidden="true"
          />
          <Input
            id="catalog-search"
            type="search"
            placeholder="Search by name or category…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search services"
          />
        </div>

        {/* Category filter */}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48 min-h-[44px]" aria-label="Filter by category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {allActiveCategories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-36 min-h-[44px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        {/* Spacer on desktop */}
        <div className="flex-1 hidden sm:block" />

        {/* Import CSV split button — ADMIN/SUPER_ADMIN only */}
        {canImport && (
          <div className="flex items-center">
            <Button
              type="button"
              variant="outline"
              className="gap-2 min-h-[44px] rounded-r-none border-r-0"
              onClick={() => setImportSheetOpen(true)}
            >
              <Upload size={15} aria-hidden="true" />
              Import CSV
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] px-2 rounded-l-none"
                  aria-label="Template download options"
                >
                  <ChevronDown size={15} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => setImportSheetOpen(true)}
                >
                  <Upload size={14} /> Import CSV
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onClick={() => downloadTemplate('csv')}>
                  <Download size={14} /> Download CSV template
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onClick={() => downloadTemplate('xlsx')}>
                  <Download size={14} /> Download XLSX template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* View toggle — hidden on mobile */}
        <div className="hidden sm:flex items-center rounded-lg border border-[var(--color-border)] overflow-hidden">
          <button
            type="button"
            onClick={() => switchView('grid')}
            aria-label="Card view"
            aria-pressed={viewMode === 'grid'}
            className={`flex items-center justify-center w-10 h-10 transition-colors ${
              viewMode === 'grid'
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-white text-[var(--color-muted)] hover:bg-[var(--color-surface)]'
            }`}
          >
            <LayoutGrid size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => switchView('table')}
            aria-label="Table view"
            aria-pressed={viewMode === 'table'}
            className={`flex items-center justify-center w-10 h-10 transition-colors ${
              viewMode === 'table'
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-white text-[var(--color-muted)] hover:bg-[var(--color-surface)]'
            }`}
          >
            <List size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ─── TABLE VIEW ───────────────────────────────────────────────── */}
      {viewMode === 'table' ? (
        filtered.length === 0 ? (
          <EmptyState
            search={search}
            categoryFilter={categoryFilter}
            statusFilter={statusFilter}
            onAdd={openAdd}
          />
        ) : (
          <CatalogTableView services={filtered} onEdit={openEdit} />
        )
      ) : (
        /* ─── CARD / GRID VIEW ──────────────────────────────────────── */
        <>
          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--color-accent-light)] border border-[var(--color-accent)] text-sm">
              <span className="text-[var(--color-accent)] font-medium">
                {selected.size} selected
              </span>
              <div className="flex-1" />
              {activeSelected.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white min-h-[36px]"
                  onClick={handleBulkArchive}
                >
                  <Archive size={14} />
                  Archive {activeSelected.length} active
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

          {filtered.length === 0 ? (
            <EmptyState
              search={search}
              categoryFilter={categoryFilter}
              statusFilter={statusFilter}
              onAdd={openAdd}
            />
          ) : (
            <>
              {/* Select all row */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="select-all"
                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll}
                  aria-label="Select all services"
                />
                <label htmlFor="select-all" className="text-xs text-[var(--color-muted)] cursor-pointer">
                  Select all ({filtered.length})
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    selected={selected.has(service.id)}
                    onToggleSelect={() => toggleSelect(service.id)}
                    onEdit={() => openEdit(service)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Service add/edit drawer */}
      <ServiceSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        service={editingService}
        categories={categories}
        paymentTemplates={paymentTemplates}
        tcTemplates={tcTemplates}
      />

      {/* Import CSV sheet */}
      <ImportCsvSheet
        open={importSheetOpen}
        onOpenChange={setImportSheetOpen}
      />
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  search,
  categoryFilter,
  statusFilter,
  onAdd,
}: {
  search: string
  categoryFilter: string
  statusFilter: string
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-[var(--color-border)] bg-white gap-3">
      <Package size={40} className="text-[var(--color-muted)]" aria-hidden="true" />
      <p className="text-sm text-[var(--color-muted)]">
        {search || categoryFilter !== 'all'
          ? 'No services match your filters.'
          : statusFilter === 'archived'
          ? 'No archived services.'
          : 'No services yet. Add your first service to the catalog.'}
      </p>
      {!search && categoryFilter === 'all' && statusFilter !== 'archived' && (
        <Button type="button" size="sm" onClick={onAdd}>
          Add service
        </Button>
      )}
    </div>
  )
}

// ─── Service card ─────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  selected,
  onToggleSelect,
  onEdit,
}: {
  service: ServiceListItem
  selected: boolean
  onToggleSelect: () => void
  onEdit: () => void
}) {
  const checkboxId = `select-${service.id}`

  return (
    <div
      className={`relative bg-white rounded-xl border transition-shadow ${
        selected
          ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]'
          : 'border-[var(--color-border)] hover:shadow-sm'
      }`}
    >
      {/* Checkbox */}
      <div className="absolute top-3 left-3 z-10">
        <input
          type="checkbox"
          id={checkboxId}
          className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${service.name}`}
        />
      </div>

      <div className="p-5 pl-9">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[var(--color-primary)] truncate text-sm">
              {service.name}
            </h3>
            <p className="text-xs text-[var(--color-muted)] mt-0.5 line-clamp-2">
              {service.description}
            </p>
          </div>
          <span
            className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              service.isActive
                ? 'bg-green-100 text-green-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {service.isActive ? 'Active' : 'Archived'}
          </span>
        </div>

        {/* Category badge */}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)] mb-3">
          {service.category}
        </span>

        {/* Rate + unit */}
        <div className="flex items-baseline gap-1.5 mb-1">
          <span className="text-lg font-bold text-[var(--color-primary)]">
            {formatRate(service.defaultRate)}
          </span>
          <span className="text-xs text-[var(--color-muted)]">{service.unit}</span>
        </div>
        {service.minRate && (
          <p className="text-xs text-[var(--color-muted)]">
            Floor: {formatRate(service.minRate)}
            {service.maxRate ? ` · Ceiling: ${formatRate(service.maxRate)}` : ''}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--color-border)]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 min-h-[36px] text-xs"
            onClick={onEdit}
          >
            Edit
          </Button>
          <Link href={`/catalog/${service.id}`}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-[36px] min-w-[36px] p-0"
              aria-label={`View ${service.name} details`}
            >
              <ChevronRight size={16} />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
