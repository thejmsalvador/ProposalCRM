'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Contact as ContactIcon,
  Edit2,
  Mail,
  Phone,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { createContact, updateContact, removeContact } from '@/lib/actions/clients'
import type { ContactListItem } from '@/lib/queries/clients'

export type CompanyOption = { id: string; companyName: string }

// ─── Contact form sheet ───────────────────────────────────────────────────────

const NO_COMPANY = '__none__'

type ContactFormData = {
  contactName: string
  contactTitle: string
  department: string
  email: string
  phone: string
  clientId: string
  isPrimary: boolean
  notes: string
}

const emptyForm: ContactFormData = {
  contactName: '',
  contactTitle: '',
  department: '',
  email: '',
  phone: '',
  clientId: NO_COMPANY,
  isPrimary: false,
  notes: '',
}

function ContactSheet({
  open,
  onClose,
  companies,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  companies: CompanyOption[]
  initial?: ContactListItem
  onSaved: () => void
}) {
  const mode = initial ? 'edit' : 'add'
  const [form, setForm] = useState<ContactFormData>(
    initial
      ? {
          contactName: initial.contactName ?? '',
          contactTitle: initial.contactTitle ?? '',
          department: initial.department ?? '',
          email: initial.email ?? '',
          phone: initial.phone ?? '',
          clientId: initial.company?.id ?? NO_COMPANY,
          isPrimary: initial.isPrimary,
          notes: initial.notes ?? '',
        }
      : emptyForm,
  )
  const [isSaving, setIsSaving] = useState(false)

  const hasCompany = form.clientId !== NO_COMPANY

  async function handleSave() {
    setIsSaving(true)
    const payload = {
      contactName: form.contactName.trim(),
      contactTitle: form.contactTitle || undefined,
      department: form.department || undefined,
      email: form.email || '',
      phone: form.phone || undefined,
      clientId: hasCompany ? form.clientId : null,
      isPrimary: hasCompany ? form.isPrimary : false,
      notes: form.notes || undefined,
    }
    const result =
      mode === 'add'
        ? await createContact(payload)
        : await updateContact(initial!.id, payload)
    setIsSaving(false)
    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
      return
    }
    toast({ title: mode === 'add' ? 'Contact added' : 'Contact updated' })
    if (mode === 'add') setForm(emptyForm)
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
            <Label htmlFor="ct-name">Name *</Label>
            <Input
              id="ct-name"
              value={form.contactName}
              onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              placeholder="e.g. Maria Santos"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ct-company">Company</Label>
            <Select
              value={form.clientId}
              onValueChange={(val) =>
                setForm((f) => ({
                  ...f,
                  clientId: val,
                  isPrimary: val === NO_COMPANY ? false : f.isPrimary,
                }))
              }
            >
              <SelectTrigger id="ct-company">
                <SelectValue placeholder="Select company..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COMPANY}>No company (standalone)</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ct-title">Position</Label>
            <Input
              id="ct-title"
              value={form.contactTitle}
              onChange={(e) => setForm((f) => ({ ...f, contactTitle: e.target.value }))}
              placeholder="e.g. Marketing Director"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ct-department">Department</Label>
            <Input
              id="ct-department"
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              placeholder="e.g. Marketing"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ct-email">Email Address</Label>
            <Input
              id="ct-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="e.g. maria@acme.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ct-phone">Contact Number</Label>
            <Input
              id="ct-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="e.g. +63 917 123 4567"
            />
          </div>
          {hasCompany && (
            <div className="flex items-center gap-3">
              <input
                id="ct-primary"
                type="checkbox"
                checked={form.isPrimary}
                onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <Label htmlFor="ct-primary" className="cursor-pointer">
                Primary contact for this company
              </Label>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ct-notes">Notes</Label>
            <textarea
              id="ct-notes"
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

// ─── Row actions (edit / delete) ──────────────────────────────────────────────

function ContactActions({
  contact,
  companies,
  onChanged,
}: {
  contact: ContactListItem
  companies: CompanyOption[]
  onChanged: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function handleDelete() {
    const result = await removeContact(contact.id)
    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Contact removed' })
      onChanged()
    }
    setDeleteOpen(false)
  }

  return (
    <>
      <div className="flex gap-1 justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600"
          onClick={(e) => { e.stopPropagation(); setEditOpen(true) }}
          aria-label={`Edit ${contact.contactName ?? 'contact'}`}
        >
          <Edit2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
          onClick={(e) => { e.stopPropagation(); setDeleteOpen(true) }}
          aria-label={`Remove ${contact.contactName ?? 'contact'}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {editOpen && (
        <ContactSheet
          open={editOpen}
          onClose={() => setEditOpen(false)}
          companies={companies}
          initial={contact}
          onSaved={onChanged}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Contact?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            This will permanently remove <strong>{contact.contactName}</strong> from
            your contact book.
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

// ─── Contacts tab ─────────────────────────────────────────────────────────────

type Props = {
  contacts: ContactListItem[]
  companies: CompanyOption[]
  addOpen: boolean
  onAddOpen: () => void
  onAddClose: () => void
}

export function ContactsTab({ contacts, companies, addOpen, onAddOpen, onAddClose }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  function refresh() {
    router.refresh()
  }

  const q = search.toLowerCase()
  const filtered = contacts.filter((c) =>
    [c.contactName, c.company?.companyName, c.department, c.contactTitle, c.email]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q)),
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
            <ContactIcon className="h-8 w-8 text-indigo-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-800">No contacts yet</p>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">
              Contacts are saved automatically from proposals, or you can add one
              manually — with or without a company.
            </p>
          </div>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={onAddOpen}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <ContactIcon className="h-8 w-8 text-slate-300" />
          <p className="text-slate-500 text-sm">No contacts match your search.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl border border-[var(--color-border)] bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-slate-500">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Position</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
                          {(c.contactName ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-900 truncate">
                          {c.contactName ?? 'Unknown'}
                        </span>
                        {c.isPrimary && c.company && (
                          <Star
                            className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0"
                            aria-label="Primary contact"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.company ? (
                        <Link
                          href={`/clients/${c.company.id}`}
                          className="text-indigo-600 hover:underline flex items-center gap-1.5"
                        >
                          <Building2 size={12} className="shrink-0" />
                          {c.company.companyName}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.department || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{c.contactTitle || '—'}</td>
                    <td className="px-4 py-3">
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="text-indigo-600 hover:underline"
                        >
                          {c.email}
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {c.phone || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <ContactActions contact={c} companies={companies} onChanged={refresh} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden flex flex-col gap-3">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-slate-200 bg-white p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
                      {(c.contactName ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-slate-900 truncate">
                          {c.contactName ?? 'Unknown'}
                        </p>
                        {c.isPrimary && c.company && (
                          <Star
                            className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0"
                            aria-label="Primary contact"
                          />
                        )}
                      </div>
                      {(c.contactTitle || c.department) && (
                        <p className="text-xs text-slate-500 truncate">
                          {[c.contactTitle, c.department].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <ContactActions contact={c} companies={companies} onChanged={refresh} />
                </div>
                {c.company && (
                  <Link
                    href={`/clients/${c.company.id}`}
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1.5"
                  >
                    <Building2 size={12} className="shrink-0" />
                    {c.company.companyName}
                  </Link>
                )}
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1.5"
                  >
                    <Mail size={12} className="shrink-0 text-slate-400" />
                    {c.email}
                  </a>
                )}
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className="text-xs text-slate-700 flex items-center gap-1.5"
                  >
                    <Phone size={12} className="shrink-0 text-slate-400" />
                    {c.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add contact sheet */}
      {addOpen && (
        <ContactSheet
          open={addOpen}
          onClose={onAddClose}
          companies={companies}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
