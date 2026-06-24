'use client'

import { useState, useMemo } from 'react'
import { Landmark, Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ModeOfPaymentListItem } from '@/lib/actions/mode-of-payment'
import { ModeOfPaymentDialog } from './ModeOfPaymentDialog'

type StatusFilter = 'active' | 'archived' | 'all'

type Props = {
  modes: ModeOfPaymentListItem[]
}

export function ModeOfPaymentClient({ modes }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ModeOfPaymentListItem | null>(null)

  const filtered = useMemo(() => {
    return modes.filter((m) => {
      if (statusFilter === 'active') return !m.isArchived
      if (statusFilter === 'archived') return m.isArchived
      return true
    })
  }, [modes, statusFilter])

  function openAdd() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(m: ModeOfPaymentListItem) {
    setEditing(m)
    setDialogOpen(true)
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mode of Payment</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {modes.filter((m) => !m.isArchived).length} active account
            {modes.filter((m) => !m.isArchived).length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button type="button" className="gap-2 min-h-[44px]" onClick={openAdd}>
          <Plus size={16} aria-hidden="true" />
          Add account
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
          <Landmark size={40} className="text-[var(--color-muted)]" aria-hidden="true" />
          <p className="text-sm text-[var(--color-muted)]">
            {statusFilter === 'archived'
              ? 'No archived accounts.'
              : 'No payment accounts yet. Add your first one.'}
          </p>
          {statusFilter !== 'archived' && (
            <Button type="button" size="sm" onClick={openAdd}>
              Add account
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
                    className="text-left px-4 py-3 font-medium text-[var(--color-muted)] w-56"
                  >
                    Label
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-3 font-medium text-[var(--color-muted)]"
                  >
                    Bank
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-3 font-medium text-[var(--color-muted)] hidden md:table-cell"
                  >
                    Account Name
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-3 font-medium text-[var(--color-muted)] hidden sm:table-cell"
                  >
                    Account No.
                  </th>
                  <th
                    scope="col"
                    className="text-center px-4 py-3 font-medium text-[var(--color-muted)] w-24"
                  >
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 w-24">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-[var(--color-surface)] transition-colors">
                    <td className="px-4 py-3 font-medium text-[var(--color-primary)]">
                      <span className="truncate max-w-[200px] block">{m.label}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-primary)]">{m.bankName}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)] hidden md:table-cell">
                      <span className="line-clamp-1 max-w-xs">{m.accountName}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)] tabular-nums hidden sm:table-cell">
                      {m.accountNumber}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.isArchived
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {m.isArchived ? 'Archived' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 min-h-[36px] text-xs"
                          onClick={() => openEdit(m)}
                          aria-label={`Edit ${m.label}`}
                        >
                          <Pencil size={13} aria-hidden="true" />
                          Edit
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

      <ModeOfPaymentDialog open={dialogOpen} onOpenChange={setDialogOpen} mode={editing} />
    </div>
  )
}
