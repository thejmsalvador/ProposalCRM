'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Search,
  Users,
  ChevronRight,
  ArrowUpDown,
  Building2,
  LayoutGrid,
  List,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/actions/clients'
import type { ClientListItem, ContactListItem, HealthStatus } from '@/lib/queries/clients'
import { ClientsTableView } from './ClientsTableView'
import { ContactsTab } from './ContactsTab'

// ─── Health dot ───────────────────────────────────────────────────────────────

function HealthDot({ health }: { health: HealthStatus }) {
  const styles: Record<HealthStatus, { dot: string; label: string }> = {
    Active: { dot: 'bg-green-500', label: 'text-green-700' },
    Dormant: { dot: 'bg-amber-400', label: 'text-amber-700' },
    Lapsed: { dot: 'bg-red-500', label: 'text-red-700' },
  }
  const s = styles[health]
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
      <span className={`text-xs font-medium ${s.label}`}>{health}</span>
    </span>
  )
}

// ─── Currency format ──────────────────────────────────────────────────────────

function formatPHP(value: number) {
  if (value === 0) return '₱0'
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `₱${(value / 1_000).toFixed(0)}K`
  return `₱${value.toLocaleString()}`
}

// ─── Client card ──────────────────────────────────────────────────────────────

function ClientCard({ client }: { client: ClientListItem }) {
  const lastWonText =
    client.lastWonAt && client.daysSinceLastActivity !== null
      ? `Last won ${Math.floor((Date.now() - client.lastWonAt.getTime()) / 86400000)} days ago`
      : 'No wins yet'

  const since = new Date(client.createdAt).toLocaleDateString('en-PH', {
    month: 'short',
    year: 'numeric',
  })

  return (
    <Link
      href={`/clients/${client.id}`}
      className="group flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
    >
      {/* Top */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-base shrink-0">
            {client.companyName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate leading-snug">
              {client.companyName}
            </p>
            {client.industry && (
              <span className="inline-block mt-0.5 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                {client.industry}
              </span>
            )}
            {client.primaryContact?.contactName && (
              <p className="text-xs text-slate-500 mt-1 truncate">
                {client.primaryContact.contactName}
                {client.primaryContact.contactTitle
                  ? `, ${client.primaryContact.contactTitle}`
                  : ''}
              </p>
            )}
          </div>
        </div>
        <ChevronRight
          size={16}
          className="shrink-0 text-slate-300 group-hover:text-indigo-400 mt-1 transition-colors"
        />
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {formatPHP(client.lifetimeValue)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Lifetime</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-green-700">{client.wonDeals}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Won</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-indigo-700">{client.activeDeals}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Active</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {client.totalProposals === 0 ? '—' : `${client.winRate}%`}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Win Rate</p>
        </div>
      </div>

      {/* Health indicator */}
      <div className="flex items-center">
        <HealthDot health={client.health} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100">
        <span>{lastWonText}</span>
        <span>Client since {since}</span>
      </div>
    </Link>
  )
}

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortKey = 'lifetimeValue' | 'lastActivity' | 'companyName' | 'wonDeals'

function sortClients(clients: ClientListItem[], key: SortKey): ClientListItem[] {
  return [...clients].sort((a, b) => {
    switch (key) {
      case 'lifetimeValue':
        return b.lifetimeValue - a.lifetimeValue
      case 'lastActivity': {
        const ta = a.lastActivityAt?.getTime() ?? 0
        const tb = b.lastActivityAt?.getTime() ?? 0
        return tb - ta
      }
      case 'companyName':
        return a.companyName.localeCompare(b.companyName)
      case 'wonDeals':
        return b.wonDeals - a.wonDeals
      default:
        return 0
    }
  })
}

// ─── Add Client Sheet ─────────────────────────────────────────────────────────

const INDUSTRY_SUGGESTIONS = [
  'Retail',
  'FMCG',
  'Real Estate',
  'Healthcare',
  'Financial Services',
  'Technology',
  'Education',
  'Food & Beverage',
  'Other',
]

type ClientForm = {
  companyName: string
  industry: string
  website: string
  address: string
  notes: string
}

const emptyForm: ClientForm = {
  companyName: '',
  industry: '',
  website: '',
  address: '',
  notes: '',
}

function AddClientSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [form, setForm] = useState<ClientForm>(emptyForm)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  async function handleSave() {
    if (!form.companyName.trim()) {
      toast({ title: 'Company name is required', variant: 'destructive' })
      return
    }
    setIsSaving(true)
    const result = await createClient({
      companyName: form.companyName.trim(),
      industry: form.industry || undefined,
      website: form.website || undefined,
      address: form.address || undefined,
      notes: form.notes || undefined,
    })
    setIsSaving(false)
    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
      return
    }
    toast({ title: 'Client created' })
    setForm(emptyForm)
    onCreated(result.id)
    router.push(`/clients/${result.id}`)
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Company</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-6">
          <div className="space-y-1.5">
            <Label htmlFor="add-company">Company Name *</Label>
            <Input
              id="add-company"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              placeholder="e.g. Acme Corp"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-industry">Industry</Label>
            <Input
              id="add-industry"
              list="industry-list"
              value={form.industry}
              onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
              placeholder="e.g. Retail"
            />
            <datalist id="industry-list">
              {INDUSTRY_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-website">Website</Label>
            <Input
              id="add-website"
              type="url"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              placeholder="https://example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-address">Address</Label>
            <textarea
              id="add-address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="123 Business Ave, Makati City"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[72px] resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-notes">Notes</Label>
            <textarea
              id="add-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Any internal notes about this client..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[72px] resize-y"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleSave}
              disabled={isSaving || !form.companyName.trim()}
            >
              {isSaving ? 'Saving…' : 'Create Company'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Main page component ──────────────────────────────────────────────────────

type ClientsTab = 'companies' | 'contacts'

type Props = {
  clients: ClientListItem[]
  contacts: ContactListItem[]
  initialTab?: ClientsTab
}

type ViewMode = 'grid' | 'table'

const VIEW_PREF_KEY = 'clients_view_preference'

export function ClientsClient({ clients: initial, contacts, initialTab = 'companies' }: Props) {
  const [activeTab, setActiveTab] = useState<ClientsTab>(initialTab)
  const [search, setSearch] = useState('')
  const [healthFilter, setHealthFilter] = useState<'All' | HealthStatus>('All')
  const [sortKey, setSortKey] = useState<SortKey>('lifetimeValue')
  const [addOpen, setAddOpen] = useState(false)
  const [addContactOpen, setAddContactOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  function switchTab(tab: ClientsTab) {
    setActiveTab(tab)
    // Keep the URL shareable/refreshable without a navigation
    const url = tab === 'contacts' ? '/clients?tab=contacts' : '/clients'
    window.history.replaceState(null, '', url)
  }

  // Load persisted view preference (client only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_PREF_KEY)
      if (stored === 'table' || stored === 'grid') {
        setViewMode(stored)
      } else if (window.innerWidth < 640) {
        // No saved preference: table is the default, but fall back to cards on
        // mobile where the table view isn't usable and the toggle is hidden.
        setViewMode('grid')
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

  const filtered = initial.filter((c) => {
    const matchSearch = c.companyName.toLowerCase().includes(search.toLowerCase())
    const matchHealth = healthFilter === 'All' || c.health === healthFilter
    return matchSearch && matchHealth
  })

  const sorted = sortClients(filtered, sortKey)

  const companyOptions = initial.map((c) => ({ id: c.id, companyName: c.companyName }))

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeTab === 'companies'
              ? `${initial.length} compan${initial.length !== 1 ? 'ies' : 'y'} total`
              : `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} total`}
          </p>
        </div>
        {activeTab === 'companies' ? (
          <Button
            type="button"
            className="gap-2 min-h-[44px]"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
        ) : (
          <Button
            type="button"
            className="gap-2 min-h-[44px]"
            onClick={() => setAddContactOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Clients sections"
        className="flex items-center gap-1 border-b border-[var(--color-border)] -mb-2"
      >
        {(
          [
            { key: 'companies', label: 'Companies', count: initial.length },
            { key: 'contacts', label: 'Contacts', count: contacts.length },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => switchTab(tab.key)}
            className={`flex items-center gap-2 px-4 min-h-[44px] text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-slate-700'
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                activeTab === tab.key
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'contacts' ? (
        <ContactsTab
          contacts={contacts}
          companies={companyOptions}
          addOpen={addContactOpen}
          onAddOpen={() => setAddContactOpen(true)}
          onAddClose={() => setAddContactOpen(false)}
        />
      ) : (
        <>
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search companies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['All', 'Active', 'Dormant', 'Lapsed'] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHealthFilter(h)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                healthFilter === h
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {h}
            </button>
          ))}
        </div>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-[180px]">
            <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-slate-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lifetimeValue">Lifetime Value ↓</SelectItem>
            <SelectItem value="lastActivity">Last Activity ↓</SelectItem>
            <SelectItem value="companyName">Company A–Z</SelectItem>
            <SelectItem value="wonDeals">Won Deals ↓</SelectItem>
          </SelectContent>
        </Select>

        {/* View toggle — hidden on mobile */}
        <div className="hidden sm:flex items-center rounded-lg border border-[var(--color-border)] overflow-hidden ml-auto">
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

      {/* Content */}
      {initial.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
            <Users className="h-8 w-8 text-indigo-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-800">No companies yet</p>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">
              Companies are created automatically when you save a proposal, or you can
              add one manually.
            </p>
          </div>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Building2 className="h-8 w-8 text-slate-300" />
          <p className="text-slate-500 text-sm">No companies match your filters.</p>
        </div>
      ) : viewMode === 'table' ? (
        <ClientsTableView clients={sorted} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((c) => (
            <ClientCard key={c.id} client={c} />
          ))}
        </div>
      )}
        </>
      )}

      <AddClientSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => setAddOpen(false)}
      />
    </div>
  )
}
