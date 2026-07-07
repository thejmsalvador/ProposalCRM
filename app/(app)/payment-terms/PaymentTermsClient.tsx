'use client'

import { useState, useMemo, useTransition } from 'react'
import { CreditCard, Plus, Star, Pencil, Archive, RotateCcw } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  setDefaultPaymentTerm,
  archivePaymentTerm,
  restorePaymentTerm,
} from '@/lib/actions/payment-terms'
import type { PaymentTermListItem } from '@/lib/actions/payment-terms'
import { PaymentTermDialog } from './PaymentTermDialog'

type StatusFilter = 'active' | 'archived' | 'all'

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

type Props = {
  templates: PaymentTermListItem[]
}

export function PaymentTermsClient({ templates }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PaymentTermListItem | null>(null)
  const [, startTransition] = useTransition()

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (statusFilter === 'active') return !t.isArchived
      if (statusFilter === 'archived') return t.isArchived
      return true
    })
  }, [templates, statusFilter])

  function openAdd() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(t: PaymentTermListItem) {
    setEditing(t)
    setDialogOpen(true)
  }

  function handleSetDefault(id: string) {
    startTransition(async () => {
      const result = await setDefaultPaymentTerm(id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Default template updated' })
      }
    })
  }

  function handleToggleArchive(t: PaymentTermListItem) {
    startTransition(async () => {
      const result = t.isArchived ? await restorePaymentTerm(t.id) : await archivePaymentTerm(t.id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: t.isArchived ? 'Template restored' : 'Template archived' })
      }
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment Terms</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {templates.filter((t) => !t.isArchived).length} active template
            {templates.filter((t) => !t.isArchived).length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button type="button" className="gap-2 min-h-[44px]" onClick={openAdd}>
          <Plus size={16} aria-hidden="true" />
          Add template
        </Button>
      </div>

      {/* Status filter tabs */}
      <div
        role="tablist"
        aria-label="Filter by status"
        className="flex gap-1 border-b border-[var(--color-border)]"
      >
        {(['active', 'archived', 'all'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={statusFilter === f}
            onClick={() => setStatusFilter(f)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              statusFilter === f
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-primary)]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-[var(--color-border)] bg-white gap-3">
          <CreditCard size={40} className="text-[var(--color-muted)]" aria-hidden="true" />
          <p className="text-sm text-[var(--color-muted)]">
            {statusFilter === 'archived'
              ? 'No archived templates.'
              : 'No payment templates yet. Create your first one.'}
          </p>
          {statusFilter !== 'archived' && (
            <Button type="button" size="sm" onClick={openAdd}>
              Add template
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th
                    scope="col"
                    className="text-left px-4 py-3 font-medium text-[var(--color-muted)] w-48"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-3 font-medium text-[var(--color-muted)] hidden sm:table-cell"
                  >
                    Preview
                  </th>
                  <th
                    scope="col"
                    className="text-center px-4 py-3 font-medium text-[var(--color-muted)] w-24"
                  >
                    Default
                  </th>
                  <th
                    scope="col"
                    className="text-center px-4 py-3 font-medium text-[var(--color-muted)] w-24"
                  >
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 w-36">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--color-surface)] transition-colors">
                    <td className="px-4 py-3 font-medium text-[var(--color-primary)]">
                      <div className="flex items-center gap-2">
                        {t.isDefault && (
                          <Star
                            size={14}
                            className="text-amber-400 fill-amber-400 shrink-0"
                            aria-label="Default template"
                          />
                        )}
                        <span className="truncate max-w-[160px]">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)] hidden sm:table-cell">
                      <span className="line-clamp-1 max-w-xs">
                        {stripHtml(t.bodyRichText).slice(0, 80) || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {t.isDefault ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          <Star size={10} className="fill-amber-500" aria-hidden="true" />
                          Default
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted)] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.isArchived
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {t.isArchived ? 'Archived' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 min-h-[36px] text-xs"
                          onClick={() => openEdit(t)}
                          aria-label={`Edit ${t.name}`}
                        >
                          <Pencil size={13} aria-hidden="true" />
                          Edit
                        </Button>
                        {!t.isDefault && !t.isArchived && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 min-h-[36px] text-xs text-[var(--color-muted)]"
                            onClick={() => handleSetDefault(t.id)}
                            aria-label={`Set ${t.name} as default`}
                          >
                            <Star size={13} aria-hidden="true" />
                            Set default
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 min-h-[36px] text-xs text-[var(--color-muted)]"
                          onClick={() => handleToggleArchive(t)}
                          aria-label={t.isArchived ? `Restore ${t.name}` : `Archive ${t.name}`}
                        >
                          {t.isArchived ? (
                            <>
                              <RotateCcw size={13} aria-hidden="true" /> Restore
                            </>
                          ) : (
                            <>
                              <Archive size={13} aria-hidden="true" /> Archive
                            </>
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PaymentTermDialog open={dialogOpen} onOpenChange={setDialogOpen} template={editing} />
    </div>
  )
}
