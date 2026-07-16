'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight,
  Plus,
  Edit2,
  Star,
  Mail,
  Phone,
  Copy,
  Check,
  Trash2,
  Globe,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
} from 'lucide-react'
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from 'recharts'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  updateClient,
  addContact,
  updateContact,
  removeContact,
} from '@/lib/actions/clients'
import type { ClientDetail, ClientContactDetail } from '@/lib/queries/clients'
import { Role, ProposalStatus } from '@/lib/generated/prisma/enums'

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  client: ClientDetail
  currentUserId: string
  currentUserRole: Role
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatPHP(value: number) {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ProposalStatus, string> = {
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

const STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending',
  REVISION_REQUIRED: 'Revision',
  APPROVED: 'Approved',
  SENT: 'Sent',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On Hold',
  EXPIRED: 'Expired',
}

function StatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Health ───────────────────────────────────────────────────────────────────

function HealthSection({
  health,
  daysSinceLastActivity,
  daysSinceLastWon,
  daysSinceCreated,
  createdAt,
}: {
  health: ClientDetail['health']
  daysSinceLastActivity: number | null
  daysSinceLastWon: number | null
  daysSinceCreated: number
  createdAt: Date
}) {
  const dotColor = health === 'Active' ? 'bg-green-500' : health === 'Dormant' ? 'bg-amber-400' : 'bg-red-500'
  const labelColor = health === 'Active' ? 'text-green-700' : health === 'Dormant' ? 'text-amber-700' : 'text-red-700'

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className={`w-12 h-12 rounded-full ${dotColor} flex items-center justify-center`}>
        <span className="w-4 h-4 rounded-full bg-white/60" />
      </div>
      <p className={`font-semibold text-lg ${labelColor}`}>{health}</p>
      <div className="text-sm text-slate-500 space-y-1 w-full text-center">
        <p>
          Last activity:{' '}
          {daysSinceLastActivity !== null ? `${daysSinceLastActivity} days ago` : 'No activity yet'}
        </p>
        <p>
          Last won deal:{' '}
          {daysSinceLastWon !== null ? `${daysSinceLastWon} days ago` : 'Never won'}
        </p>
        <p>
          Client since:{' '}
          {new Date(createdAt).toLocaleDateString('en-PH', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
        <p>Days as client: {daysSinceCreated}</p>
      </div>
    </div>
  )
}

// ─── Deal chart ───────────────────────────────────────────────────────────────

function DealChart({ proposals }: { client: ClientDetail; proposals: ClientDetail['proposals'] }) {
  const wonByMonth = new Map<string, number>()

  proposals
    .filter((p) => p.status === ProposalStatus.WON)
    .forEach((p) => {
      const key = new Date(p.updatedAt).toLocaleDateString('en-PH', {
        month: 'short',
        year: '2-digit',
      })
      wonByMonth.set(key, (wonByMonth.get(key) ?? 0) + p.total)
    })

  // Build sorted months
  const months = Array.from(wonByMonth.entries())
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // Cumulative line
  let cumulative = 0
  const chartData = months.map((m) => {
    cumulative += m.value
    return { ...m, cumulative }
  })

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
        <FileText className="h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-500">
          No won deals yet — chart will appear here once you close your first deal.
        </p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}K`}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: '#6366f1' }}
          tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}K`}
        />
        <Tooltip
          formatter={(value, name) => [
            `₱${Number(value ?? 0).toLocaleString()}`,
            name === 'value' ? 'Won Value' : 'Cumulative',
          ]}
        />
        <Bar yAxisId="left" dataKey="value" fill="#16a34a" radius={[4, 4, 0, 0]} name="value" />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cumulative"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ r: 3, fill: '#6366f1' }}
          name="cumulative"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ─── Contact card ─────────────────────────────────────────────────────────────

function ContactCard({
  contact,
  clientId,
  canEdit,
  onUpdated,
}: {
  contact: ClientContactDetail
  clientId: string
  canEdit: boolean
  onUpdated: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function copyEmail() {
    if (!contact.email) return
    await navigator.clipboard.writeText(contact.email)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleDelete() {
    const result = await removeContact(contact.id)
    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Contact removed' })
      onUpdated()
    }
    setDeleteOpen(false)
  }

  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {contact.isPrimary && (
                <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
              )}
              <p className="font-medium text-slate-800 text-sm truncate">
                {contact.contactName ?? 'Unknown'}
              </p>
            </div>
            {(contact.contactTitle || contact.department) && (
              <p className="text-xs text-slate-500 truncate">
                {[contact.contactTitle, contact.department].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-600"
                onClick={() => setEditOpen(true)}
                aria-label="Edit contact"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                onClick={() => setDeleteOpen(true)}
                aria-label="Remove contact"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {contact.email && (
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <a
              href={`mailto:${contact.email}`}
              className="text-xs text-indigo-600 hover:underline truncate flex-1"
            >
              {contact.email}
            </a>
            <button
              onClick={copyEmail}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Copy email"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        {contact.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <a
              href={`tel:${contact.phone}`}
              className="text-xs text-slate-700 hover:text-indigo-600 hover:underline"
            >
              {contact.phone}
            </a>
          </div>
        )}

        {contact.notes && (
          <div>
            <button
              onClick={() => setNotesOpen((p) => !p)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
            >
              {notesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {notesOpen ? 'Hide notes' : 'Show notes'}
            </button>
            {notesOpen && (
              <p className="text-xs text-slate-600 mt-1 bg-white rounded p-2 border border-slate-200">
                {contact.notes}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Edit Contact Sheet */}
      <ContactFormSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        clientId={clientId}
        initial={contact}
        mode="edit"
        onSaved={onUpdated}
      />

      {/* Delete Confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Contact?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            This will permanently remove{' '}
            <strong>{contact.contactName}</strong> from this client.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Contact form sheet ───────────────────────────────────────────────────────

type ContactFormData = {
  contactName: string
  contactTitle: string
  department: string
  email: string
  phone: string
  isPrimary: boolean
  notes: string
}

const emptyContact: ContactFormData = {
  contactName: '',
  contactTitle: '',
  department: '',
  email: '',
  phone: '',
  isPrimary: false,
  notes: '',
}

function ContactFormSheet({
  open,
  onClose,
  clientId,
  initial,
  mode,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  clientId: string
  initial?: ClientContactDetail
  mode: 'add' | 'edit'
  onSaved: () => void
}) {
  const [form, setForm] = useState<ContactFormData>(
    initial
      ? {
          contactName: initial.contactName ?? '',
          contactTitle: initial.contactTitle ?? '',
          department: initial.department ?? '',
          email: initial.email ?? '',
          phone: initial.phone ?? '',
          isPrimary: initial.isPrimary,
          notes: initial.notes ?? '',
        }
      : emptyContact,
  )
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave() {
    setIsSaving(true)
    const result =
      mode === 'add'
        ? await addContact(clientId, form)
        : await updateContact(initial!.id, form)
    setIsSaving(false)
    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
      return
    }
    toast({ title: mode === 'add' ? 'Contact added' : 'Contact updated' })
    onSaved()
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{mode === 'add' ? 'Add Contact' : 'Edit Contact'}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-6">
          <div className="space-y-1.5">
            <Label htmlFor="cf-name">Name *</Label>
            <Input
              id="cf-name"
              value={form.contactName}
              onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              placeholder="e.g. Maria Santos"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-title">Position</Label>
            <Input
              id="cf-title"
              value={form.contactTitle}
              onChange={(e) => setForm((f) => ({ ...f, contactTitle: e.target.value }))}
              placeholder="e.g. CEO"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-department">Department</Label>
            <Input
              id="cf-department"
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              placeholder="e.g. Marketing"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-email">Email</Label>
            <Input
              id="cf-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="e.g. maria@acme.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-phone">Phone</Label>
            <Input
              id="cf-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="e.g. +63 917 123 4567"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              id="cf-primary"
              type="checkbox"
              checked={form.isPrimary}
              onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            <Label htmlFor="cf-primary" className="cursor-pointer">
              Primary contact
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-notes">Notes</Label>
            <textarea
              id="cf-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Internal notes about this contact..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[60px] resize-y"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleSave}
              disabled={isSaving || !form.contactName.trim()}
            >
              {isSaving ? 'Saving…' : mode === 'add' ? 'Add Contact' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Edit Client Sheet ────────────────────────────────────────────────────────

const INDUSTRY_SUGGESTIONS = [
  'Retail', 'FMCG', 'Real Estate', 'Healthcare', 'Financial Services',
  'Technology', 'Education', 'Food & Beverage', 'Other',
]

function EditClientSheet({
  open,
  onClose,
  client,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  client: ClientDetail
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    companyName: client.companyName,
    accountCode: client.accountCode ?? '',
    industry: client.industry ?? '',
    website: client.website ?? '',
    address: client.address ?? '',
    notes: client.notes ?? '',
  })
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave() {
    if (!form.companyName.trim()) {
      toast({ title: 'Company name is required', variant: 'destructive' })
      return
    }
    if (!form.accountCode.trim()) {
      toast({ title: 'Account code is required', variant: 'destructive' })
      return
    }
    setIsSaving(true)
    const result = await updateClient(client.id, form)
    setIsSaving(false)
    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
      return
    }
    toast({ title: 'Client updated' })
    onSaved()
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Client</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 mt-6">
          <div className="space-y-1.5">
            <Label htmlFor="ec-company">Company Name *</Label>
            <Input
              id="ec-company"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-account-code">Account Code *</Label>
            <Input
              id="ec-account-code"
              value={form.accountCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, accountCode: e.target.value.toUpperCase() }))
              }
              placeholder="e.g. SUNB"
            />
            <p className="text-xs text-slate-500">
              Short internal code (usually 3–5 letters).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-industry">Industry</Label>
            <Input
              id="ec-industry"
              list="ec-industry-list"
              value={form.industry}
              onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
            />
            <datalist id="ec-industry-list">
              {INDUSTRY_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-website">Website</Label>
            <Input
              id="ec-website"
              type="url"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              placeholder="https://example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-address">Address</Label>
            <textarea
              id="ec-address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[72px] resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-notes">Notes</Label>
            <textarea
              id="ec-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[72px] resize-y"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleSave}
              disabled={isSaving || !form.companyName.trim()}
            >
              {isSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-1">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${accent ?? 'text-slate-800'}`}>{value}</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClientDetailClient({ client: initial, currentUserId, currentUserRole }: Props) {
  const router = useRouter()
  const [client] = useState(initial)
  const [editOpen, setEditOpen] = useState(false)
  const [addContactOpen, setAddContactOpen] = useState(false)
  const [showMoreProposals, setShowMoreProposals] = useState(false)

  const canEditAll = currentUserRole === Role.SALES_MANAGER
    || currentUserRole === Role.ADMIN
    || currentUserRole === Role.SUPER_ADMIN

  function refresh() {
    router.refresh()
  }

  const visibleProposals = showMoreProposals
    ? client.proposals
    : client.proposals.slice(0, 10)

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/clients" className="hover:text-indigo-600 transition-colors">
          Clients
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-slate-900 font-medium">{client.companyName}</span>
      </nav>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl shrink-0">
            {client.companyName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{client.companyName}</h1>
              {client.accountCode && (
                <span className="inline-block text-xs font-mono font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                  {client.accountCode}
                </span>
              )}
            </div>
            {client.industry && (
              <span className="inline-block mt-0.5 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                {client.industry}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Edit2 className="h-4 w-4 mr-2" />
            Edit Client
          </Button>
          <Button variant="outline" onClick={() => setAddContactOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={() => router.push(`/proposals/new?clientId=${client.id}`)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Proposal
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── LEFT: 65% ── */}
        <div className="flex-[65] min-w-0 flex flex-col gap-6">

          {/* Deal History */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Deal History</h2>
              <span className="text-xs text-slate-500">
                {client.totalProposals} proposal{client.totalProposals !== 1 ? 's' : ''} ·{' '}
                {client.wonDeals} won · {client.lostDeals} lost · {client.activeDeals} active
              </span>
            </div>

            {client.proposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <FileText className="h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">No proposals yet for this client.</p>
                <Button
                  size="sm"
                  className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => router.push(`/proposals/new?clientId=${client.id}`)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New Proposal
                </Button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Proposal #</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Project</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Value</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Owner</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProposals.map((p) => (
                        <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link
                              href={`/proposals/${p.id}`}
                              className="text-indigo-600 hover:underline font-mono text-xs"
                            >
                              {p.number}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-slate-700 max-w-[180px] truncate">{p.projectTitle}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800">
                            {formatPHP(p.total)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={p.status} />
                          </td>
                          <td className="px-4 py-3 text-slate-600">{p.createdByName}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                            {new Date(p.createdAt).toLocaleDateString('en-PH', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {client.proposals.length > 10 && (
                  <div className="px-4 py-3 border-t border-slate-100 text-center">
                    <button
                      onClick={() => setShowMoreProposals((p) => !p)}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      {showMoreProposals
                        ? 'Show less'
                        : `Show ${client.proposals.length - 10} more`}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Deal Value Over Time */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Deal Value Over Time</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Green bars = won deal value per month · Indigo line = cumulative lifetime value
              </p>
            </div>
            <div className="p-5">
              <DealChart client={client} proposals={client.proposals} />
            </div>
          </section>
        </div>

        {/* ── RIGHT: 35% sidebar ── */}
        <div className="flex-[35] flex flex-col gap-4 min-w-[260px]">

          {/* Overview stats */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="font-semibold text-slate-900">Client Overview</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Lifetime Value"
                value={formatPHP(client.lifetimeValue)}
                accent="text-green-700"
              />
              <StatCard
                label="Win Rate"
                value={client.totalProposals === 0 ? '—' : `${client.winRate}%`}
              />
              <StatCard
                label="Avg Deal Size"
                value={client.wonDeals === 0 ? '—' : formatPHP(client.averageDealSize)}
              />
              <StatCard
                label="Total Proposals"
                value={String(client.totalProposals)}
              />
            </div>
          </section>

          {/* Relationship Health */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900 mb-2">Relationship Health</h2>
            <HealthSection
              health={client.health}
              daysSinceLastActivity={client.daysSinceLastActivity}
              daysSinceLastWon={client.daysSinceLastWon}
              daysSinceCreated={client.daysSinceCreated}
              createdAt={client.createdAt}
            />
          </section>

          {/* Contacts */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">
                Contacts at {client.companyName}
              </h2>
              <button
                onClick={() => setAddContactOpen(true)}
                className="text-xs text-indigo-600 hover:underline"
              >
                + Add
              </button>
            </div>

            {client.contacts.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-slate-500">No contacts yet.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setAddContactOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Contact
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {client.contacts.map((c) => (
                  <ContactCard
                    key={c.id}
                    contact={c}
                    clientId={client.id}
                    canEdit={canEditAll || c.createdById === currentUserId}
                    onUpdated={refresh}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Company Details */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Company Details</h2>
              <button
                onClick={() => setEditOpen(true)}
                className="text-xs text-indigo-600 hover:underline"
              >
                Edit
              </button>
            </div>
            <div className="space-y-2 text-sm">
              {client.accountCode && (
                <div>
                  <span className="text-slate-500 text-xs">Account Code</span>
                  <p className="text-slate-800 font-mono">{client.accountCode}</p>
                </div>
              )}
              {client.industry && (
                <div>
                  <span className="text-slate-500 text-xs">Industry</span>
                  <p className="text-slate-800">{client.industry}</p>
                </div>
              )}
              {client.website && (
                <div>
                  <span className="text-slate-500 text-xs">Website</span>
                  <a
                    href={client.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-indigo-600 hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {client.website.replace(/^https?:\/\//, '')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {client.address && (
                <div>
                  <span className="text-slate-500 text-xs">Address</span>
                  <p className="text-slate-800 whitespace-pre-line">{client.address}</p>
                </div>
              )}
              {client.notes && (
                <div>
                  <span className="text-slate-500 text-xs">Notes</span>
                  <p className="text-slate-700 whitespace-pre-line text-xs">{client.notes}</p>
                </div>
              )}
              {!client.accountCode && !client.industry && !client.website && !client.address && !client.notes && (
                <p className="text-slate-400 text-xs italic">No company details added yet.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Edit Client Sheet */}
      <EditClientSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        client={client}
        onSaved={refresh}
      />

      {/* Add Contact Sheet */}
      <ContactFormSheet
        open={addContactOpen}
        onClose={() => setAddContactOpen(false)}
        clientId={client.id}
        mode="add"
        onSaved={refresh}
      />
    </div>
  )
}
