'use client'

import { useState, useMemo, useTransition } from 'react'
import { ScrollText, Plus, Lock, LockOpen, Copy, Pencil } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  lockTcTemplate,
  unlockTcTemplate,
  duplicateTcTemplate,
} from '@/lib/actions/tc-templates'
import type { TcTemplateListItem } from '@/lib/actions/tc-templates'
import { TcTemplateDialog } from './TcTemplateDialog'

type StatusFilter = 'active' | 'archived' | 'all'

type Props = {
  templates: TcTemplateListItem[]
  serviceCategories: string[]
  isSuperAdmin: boolean
}

export function TcTemplatesClient({ templates, serviceCategories, isSuperAdmin }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TcTemplateListItem | null>(null)
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

  function openEdit(t: TcTemplateListItem) {
    setEditing(t)
    setDialogOpen(true)
  }

  function handleLock(id: string) {
    startTransition(async () => {
      const result = await lockTcTemplate(id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Template locked' })
      }
    })
  }

  function handleUnlock(id: string) {
    startTransition(async () => {
      const result = await unlockTcTemplate(id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Template unlocked' })
      }
    })
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateTcTemplate(id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Template duplicated', description: 'A new editable copy has been created.' })
      }
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Terms &amp; Conditions
          </h1>
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
          <ScrollText size={40} className="text-[var(--color-muted)]" aria-hidden="true" />
          <p className="text-sm text-[var(--color-muted)]">
            {statusFilter === 'archived'
              ? 'No archived templates.'
              : 'No T&C templates yet. Create your first one.'}
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
                    Associated categories
                  </th>
                  <th
                    scope="col"
                    className="text-center px-4 py-3 font-medium text-[var(--color-muted)] w-24"
                  >
                    Locked
                  </th>
                  <th
                    scope="col"
                    className="text-center px-4 py-3 font-medium text-[var(--color-muted)] w-24"
                  >
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 w-52">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--color-surface)] transition-colors">
                    {/* Name */}
                    <td className="px-4 py-3 font-medium text-[var(--color-primary)]">
                      <div className="flex items-center gap-2">
                        {t.isLocked && (
                          <Lock
                            size={13}
                            className="text-[var(--color-muted)] shrink-0"
                            aria-label="Locked"
                          />
                        )}
                        <span className="truncate max-w-[160px]">{t.name}</span>
                      </div>
                    </td>

                    {/* Categories */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {t.categories.length === 0 ? (
                        <span className="text-[var(--color-muted)] text-xs">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {t.categories.map((c) => (
                            <span
                              key={c}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Lock status */}
                    <td className="px-4 py-3 text-center">
                      {t.isLocked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          <Lock size={10} aria-hidden="true" />
                          Locked
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted)] text-xs">—</span>
                      )}
                    </td>

                    {/* Archive status */}
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

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit — disabled when locked */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 min-h-[36px] text-xs"
                          onClick={() => openEdit(t)}
                          aria-label={t.isLocked ? `View ${t.name} (locked)` : `Edit ${t.name}`}
                        >
                          <Pencil size={13} aria-hidden="true" />
                          {t.isLocked ? 'View' : 'Edit'}
                        </Button>

                        {/* Duplicate */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 min-h-[36px] text-xs text-[var(--color-muted)]"
                          onClick={() => handleDuplicate(t.id)}
                          aria-label={`Duplicate ${t.name}`}
                        >
                          <Copy size={13} aria-hidden="true" />
                          Duplicate
                        </Button>

                        {/* Lock / Unlock — SUPER_ADMIN only */}
                        {isSuperAdmin && !t.isArchived && (
                          t.isLocked ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 min-h-[36px] text-xs text-[var(--color-muted)]"
                              onClick={() => handleUnlock(t.id)}
                              aria-label={`Unlock ${t.name}`}
                            >
                              <LockOpen size={13} aria-hidden="true" />
                              Unlock
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 min-h-[36px] text-xs text-[var(--color-muted)]"
                              onClick={() => handleLock(t.id)}
                              aria-label={`Lock ${t.name}`}
                            >
                              <Lock size={13} aria-hidden="true" />
                              Lock
                            </Button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TcTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        template={editing}
        serviceCategories={serviceCategories}
      />
    </div>
  )
}
