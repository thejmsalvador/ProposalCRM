'use client'

import { useState, useMemo, useTransition, useRef, useEffect, useCallback } from 'react'
import { ScrollText, Plus, Lock, LockOpen, Copy, Pencil, Archive, RotateCcw } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  lockTcTemplate,
  unlockTcTemplate,
  duplicateTcTemplate,
  archiveTcTemplate,
  restoreTcTemplate,
} from '@/lib/actions/tc-templates'
import type { TcTemplateListItem } from '@/lib/actions/tc-templates'
import { TcTemplateDialog } from './TcTemplateDialog'

type StatusFilter = 'active' | 'archived' | 'all'

type Props = {
  templates: TcTemplateListItem[]
  serviceCategories: string[]
  existingCategories: string[]
  isSuperAdmin: boolean
}

// Resizable columns: persisted px widths for the variable-content columns.
const COL_DEFAULTS = { name: 240, categories: 320 }
const COL_MIN = 120
const COL_STORAGE_KEY = 'tc-templates-col-widths'

export function TcTemplatesClient({
  templates,
  serviceCategories,
  existingCategories,
  isSuperAdmin,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TcTemplateListItem | null>(null)
  const [, startTransition] = useTransition()

  // ── Column resizing ──
  const [colWidths, setColWidths] = useState(COL_DEFAULTS)
  const resizing = useRef<{ key: keyof typeof COL_DEFAULTS; startX: number; startW: number } | null>(
    null,
  )

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COL_STORAGE_KEY)
      if (saved) setColWidths({ ...COL_DEFAULTS, ...JSON.parse(saved) })
    } catch {
      /* ignore malformed storage */
    }
  }, [])

  const onResizeMove = useCallback((e: MouseEvent) => {
    const r = resizing.current
    if (!r) return
    const next = Math.max(COL_MIN, r.startW + (e.clientX - r.startX))
    setColWidths((prev) => ({ ...prev, [r.key]: next }))
  }, [])

  const onResizeEnd = useCallback(() => {
    resizing.current = null
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    window.removeEventListener('mousemove', onResizeMove)
    window.removeEventListener('mouseup', onResizeEnd)
    setColWidths((prev) => {
      try {
        localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(prev))
      } catch {
        /* ignore */
      }
      return prev
    })
  }, [onResizeMove])

  const startResize = useCallback(
    (key: keyof typeof COL_DEFAULTS) => (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      resizing.current = { key, startX: e.clientX, startW: colWidths[key] }
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
      window.addEventListener('mousemove', onResizeMove)
      window.addEventListener('mouseup', onResizeEnd)
    },
    [colWidths, onResizeMove, onResizeEnd],
  )

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

  function handleToggleArchive(t: TcTemplateListItem) {
    startTransition(async () => {
      const result = t.isArchived ? await restoreTcTemplate(t.id) : await archiveTcTemplate(t.id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: t.isArchived ? 'Section restored' : 'Section archived' })
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
            {templates.filter((t) => !t.isArchived).length} active section
            {templates.filter((t) => !t.isArchived).length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button type="button" className="gap-2 min-h-[44px]" onClick={openAdd}>
          <Plus size={16} aria-hidden="true" />
          Add section
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
              ? 'No archived sections.'
              : 'No T&C sections yet. Create your first one.'}
          </p>
          {statusFilter !== 'archived' && (
            <Button type="button" size="sm" onClick={openAdd}>
              Add section
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed" role="table">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th
                    scope="col"
                    style={{ width: colWidths.name }}
                    className="relative text-left px-4 py-3 font-medium text-[var(--color-muted)]"
                  >
                    Name
                    <ResizeHandle onMouseDown={startResize('name')} label="Resize Name column" />
                  </th>
                  <th
                    scope="col"
                    style={{ width: colWidths.categories }}
                    className="relative text-left px-4 py-3 font-medium text-[var(--color-muted)] hidden sm:table-cell"
                  >
                    Associated categories
                    <ResizeHandle
                      onMouseDown={startResize('categories')}
                      label="Resize Associated categories column"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3 w-36">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--color-surface)] transition-colors">
                    {/* Name — click to open */}
                    <td className="px-4 py-3 font-medium text-[var(--color-primary)]">
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="flex items-center gap-2 text-left hover:text-[var(--color-accent)] hover:underline w-full min-h-[28px]"
                        aria-label={t.isLocked ? `View ${t.name} (locked)` : `Edit ${t.name}`}
                      >
                        {t.isLocked && (
                          <Lock
                            size={13}
                            className="text-[var(--color-muted)] shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span className="break-words">{t.name}</span>
                      </button>
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

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit — disabled when locked */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-[36px] min-w-[36px]"
                          onClick={() => openEdit(t)}
                          aria-label={t.isLocked ? `View ${t.name} (locked)` : `Edit ${t.name}`}
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </Button>

                        {/* Duplicate */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-[36px] min-w-[36px] text-[var(--color-muted)]"
                          onClick={() => handleDuplicate(t.id)}
                          aria-label={`Duplicate ${t.name}`}
                        >
                          <Copy size={15} aria-hidden="true" />
                        </Button>

                        {/* Lock / Unlock — SUPER_ADMIN only */}
                        {isSuperAdmin && !t.isArchived && (
                          t.isLocked ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="min-h-[36px] min-w-[36px] text-[var(--color-muted)]"
                              onClick={() => handleUnlock(t.id)}
                              aria-label={`Unlock ${t.name}`}
                            >
                              <LockOpen size={15} aria-hidden="true" />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="min-h-[36px] min-w-[36px] text-[var(--color-muted)]"
                              onClick={() => handleLock(t.id)}
                              aria-label={`Lock ${t.name}`}
                            >
                              <Lock size={15} aria-hidden="true" />
                            </Button>
                          )
                        )}

                        {/* Archive / Restore */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-[36px] min-w-[36px] text-[var(--color-muted)]"
                          onClick={() => handleToggleArchive(t)}
                          aria-label={t.isArchived ? `Restore ${t.name}` : `Archive ${t.name}`}
                        >
                          {t.isArchived ? (
                            <RotateCcw size={15} aria-hidden="true" />
                          ) : (
                            <Archive size={15} aria-hidden="true" />
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

      <TcTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        template={editing}
        serviceCategories={serviceCategories}
        existingCategories={existingCategories}
      />
    </div>
  )
}

// Drag handle on a table header's right edge to resize the column.
function ResizeHandle({
  onMouseDown,
  label,
}: {
  onMouseDown: (e: React.MouseEvent) => void
  label: string
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onMouseDown={onMouseDown}
      className="absolute top-0 right-0 h-full w-2 cursor-col-resize select-none touch-none
                 before:absolute before:right-0 before:top-1/2 before:-translate-y-1/2 before:h-1/2
                 before:w-px before:bg-[var(--color-border)] hover:before:bg-[var(--color-accent)]"
    />
  )
}
