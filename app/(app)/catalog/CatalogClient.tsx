'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import {
  Package,
  Plus,
  Search,
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
import type { ServiceListItem, TemplateOption } from '@/lib/actions/catalog'
import { formatCurrency } from '@/lib/validations/proposals'
import { engagementLabel } from '@/lib/validations/catalog'
import { ServiceSheet } from './ServiceSheet'
import { CatalogTableView } from './CatalogTableView'
import { ImportCsvSheet } from './ImportCsvSheet'

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
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceListItem | null>(null)
  const [importSheetOpen, setImportSheetOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

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
        filtered.length === 0 ? (
          <EmptyState
            search={search}
            categoryFilter={categoryFilter}
            statusFilter={statusFilter}
            onAdd={openAdd}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onEdit={() => openEdit(service)}
              />
            ))}
          </div>
        )
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
  onEdit,
}: {
  service: ServiceListItem
  onEdit: () => void
}) {
  const itemCost = parseFloat(service.defaultRate)
  const itemTotal = itemCost * service.engagementTerm

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Edit ${service.name}`}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit()
        }
      }}
      className="group relative bg-white rounded-xl border border-[var(--color-border)] cursor-pointer transition-all hover:shadow-sm hover:border-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      <div className="p-5">
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

        {/* Service category */}
        <p className="text-xs mb-3">
          <span className="text-[var(--color-muted)]">Service Category: </span>
          <span className="font-medium text-[var(--color-primary)]">{service.category}</span>
        </p>

        {/* Item total + breakdown */}
        <div className="flex items-baseline gap-1.5 mb-1">
          <span className="text-lg font-bold text-[var(--color-primary)] tabular-nums">
            {formatCurrency(itemTotal)}
          </span>
          <span className="text-xs text-[var(--color-muted)]">total</span>
        </div>
        <p className="text-xs text-[var(--color-muted)] tabular-nums">
          {formatCurrency(itemCost)}
          {service.engagementTerm > 1
            ? ` × ${service.engagementTerm} month${service.engagementTerm !== 1 ? 's' : ''}`
            : ''}{' '}
          · {engagementLabel(service.unit)}
        </p>

        {/* Subtle detail link — stops propagation so it doesn't trigger edit */}
        <Link
          href={`/catalog/${service.id}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-3 inline-flex items-center gap-0.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-colors"
          aria-label={`View ${service.name} details`}
        >
          View details
          <ChevronRight size={12} aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
