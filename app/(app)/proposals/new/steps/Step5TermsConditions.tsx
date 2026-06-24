'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical,
  Check,
  Search,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useWizard } from '../WizardContext'
import type { TCTemplateOption } from '@/lib/actions/proposals'
import type { TcSectionFormData } from '@/lib/validations/proposals'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/ui/rich-text-editor-lazy'

export function Step5TermsConditions() {
  const { form, tcTemplates, services: catalogServices } = useWizard()
  const { setValue, watch } = form

  const watchedSections = watch('tcSections')
  const tcSections = useMemo(
    () => (watchedSections ?? []) as TcSectionFormData[],
    [watchedSections],
  )
  const watchedLineItems = watch('lineItems')

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const hasAutoSuggested = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const byId = useMemo(
    () => new Map(tcTemplates.map((t) => [t.id, t])),
    [tcTemplates],
  )

  const selectedIds = useMemo(
    () => new Set(tcSections.map((s) => s.tcTemplateId)),
    [tcSections],
  )

  // All distinct categories across the section library, for the filter chips.
  const allCategories = useMemo(() => {
    const set = new Set<string>()
    for (const t of tcTemplates) t.categories.forEach((c) => set.add(c))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [tcTemplates])

  // ── Auto-suggest: pre-select every section whose categories overlap the
  // categories of the services on this proposal (first mount only). ──
  useEffect(() => {
    if (hasAutoSuggested.current || tcSections.length > 0 || tcTemplates.length === 0) {
      return
    }

    const selectedServiceIds = (watchedLineItems ?? [])
      .map((li) => li.serviceId)
      .filter(Boolean) as string[]
    const usedCategories = new Set(
      catalogServices
        .filter((s) => selectedServiceIds.includes(s.id))
        .map((s) => s.category),
    )
    if (usedCategories.size === 0) return

    const matches = tcTemplates.filter((t) =>
      t.categories.some((c) => usedCategories.has(c)),
    )
    if (matches.length > 0) {
      setValue(
        'tcSections',
        matches.map((t) => ({ tcTemplateId: t.id, override: null })),
        { shouldDirty: true },
      )
      hasAutoSuggested.current = true
    }
  }, [watchedLineItems, tcTemplates, catalogServices, tcSections.length, setValue])

  // ── Mutators ──
  function commit(next: TcSectionFormData[]) {
    setValue('tcSections', next, { shouldDirty: true, shouldValidate: true })
  }

  function toggleSection(id: string) {
    if (selectedIds.has(id)) {
      commit(tcSections.filter((s) => s.tcTemplateId !== id))
    } else {
      commit([...tcSections, { tcTemplateId: id, override: null }])
    }
  }

  function updateSection(id: string, patch: Partial<TcSectionFormData>) {
    commit(tcSections.map((s) => (s.tcTemplateId === id ? { ...s, ...patch } : s)))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = tcSections.findIndex((s) => s.tcTemplateId === active.id)
    const newIndex = tcSections.findIndex((s) => s.tcTemplateId === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    commit(arrayMove(tcSections, oldIndex, newIndex))
  }

  // ── Available-sections filtering ──
  const availableFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tcTemplates.filter((t) => {
      if (categoryFilter && !t.categories.includes(categoryFilter)) return false
      if (q && !t.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [tcTemplates, search, categoryFilter])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-primary)]">
          Terms &amp; Conditions
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Select the T&amp;C sections that apply to this proposal. Reorder and override
          them as needed — they are compiled in order on the PDF.
        </p>
      </div>

      {/* ── Available sections ── */}
      <div className="space-y-3">
        <Label>Available sections</Label>

        {/* Search + category filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sections…"
              aria-label="Search T&C sections"
              className="pl-9"
            />
          </div>
        </div>

        {allCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
            <button
              type="button"
              onClick={() => setCategoryFilter(null)}
              aria-pressed={categoryFilter === null}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors min-h-[32px] ${
                categoryFilter === null
                  ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                  : 'bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)]'
              }`}
            >
              All
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                aria-pressed={categoryFilter === cat}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors min-h-[32px] ${
                  categoryFilter === cat
                    ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                    : 'bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Section checklist */}
        {availableFiltered.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)]">
            <p className="text-sm text-[var(--color-muted)]">
              {tcTemplates.length === 0
                ? 'No T&C sections exist yet. Add them in the Terms & Conditions library.'
                : 'No sections match your search/filter.'}
            </p>
          </div>
        ) : (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] divide-y divide-[var(--color-border)] overflow-hidden">
            {availableFiltered.map((t) => {
              const checked = selectedIds.has(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleSection(t.id)}
                  aria-pressed={checked}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-surface)] transition-colors min-h-[44px]"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      checked
                        ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                        : 'border-[var(--color-border)] bg-white'
                    }`}
                    aria-hidden="true"
                  >
                    {checked && <Check size={13} />}
                  </span>
                  <span className="flex-1 text-sm font-medium text-[var(--color-primary)]">
                    {t.name}
                  </span>
                  {t.categories.length > 0 && (
                    <span className="hidden sm:flex flex-wrap gap-1 justify-end">
                      {t.categories.map((c) => (
                        <Badge key={c} variant="secondary" className="text-[10px]">
                          {c}
                        </Badge>
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Selected sections (ordered, overridable) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>
            Selected sections{' '}
            <span className="text-[var(--color-muted)] font-normal">
              ({tcSections.length})
            </span>
          </Label>
        </div>

        {tcSections.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)]">
            <p className="text-sm text-[var(--color-muted)]">
              No sections selected yet. Pick at least one above.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tcSections.map((s) => s.tcTemplateId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {tcSections.map((section) => {
                  const template = byId.get(section.tcTemplateId)
                  if (!template) return null
                  return (
                    <SortableSection
                      key={section.tcTemplateId}
                      section={section}
                      template={template}
                      onUpdate={(patch) => updateSection(section.tcTemplateId, patch)}
                      onRemove={() => toggleSection(section.tcTemplateId)}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}

// ─── Single selected section: drag handle, preview, override editor ──────────

function SortableSection({
  section,
  template,
  onUpdate,
  onRemove,
}: {
  section: TcSectionFormData
  template: TCTemplateOption
  onUpdate: (patch: Partial<TcSectionFormData>) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.tcTemplateId })
  const [expanded, setExpanded] = useState(false)

  const isOverriding = section.override !== null
  const effectiveHtml = isOverriding ? section.override ?? '' : template.bodyRichText

  function toggleOverride(checked: boolean) {
    onUpdate({ override: checked ? template.bodyRichText : null })
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white ${
        isDragging ? 'opacity-60 shadow-lg' : ''
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="cursor-grab touch-none text-[var(--color-muted)] hover:text-[var(--color-primary)] min-h-[44px] min-w-[28px] flex items-center"
          aria-label={`Drag to reorder ${template.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>

        <span className="flex-1 text-sm font-medium text-[var(--color-primary)]">
          {template.name}
        </span>

        {isOverriding && (
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">
            Custom
          </Badge>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-[36px] gap-1 text-xs text-[var(--color-muted)]"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${template.name}` : `Expand ${template.name}`}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Hide' : 'Edit'}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-[36px] min-w-[36px] text-[var(--color-danger)] hover:bg-red-50"
          onClick={onRemove}
          aria-label={`Remove ${template.name}`}
        >
          <Trash2 size={14} aria-hidden="true" />
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-[var(--color-border)] px-3 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              id={`override-${section.tcTemplateId}`}
              checked={isOverriding}
              onCheckedChange={toggleOverride}
            />
            <Label
              htmlFor={`override-${section.tcTemplateId}`}
              className="text-sm font-normal"
            >
              Override for this proposal
            </Label>
          </div>

          {isOverriding ? (
            <RichTextEditor
              value={section.override ?? ''}
              onChange={(html) => onUpdate({ override: html })}
              placeholder="Edit this section…"
            />
          ) : (
            <div
              className="prose prose-sm max-w-none px-3 py-2.5 bg-slate-50 rounded-[var(--radius-sm)] border border-[var(--color-border)] max-h-[300px] overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: effectiveHtml }}
            />
          )}
        </div>
      )}
    </div>
  )
}
