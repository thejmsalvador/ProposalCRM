'use client'

import { useState, useCallback } from 'react'
import { useFieldArray } from 'react-hook-form'
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
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical,
  Plus,
  Search,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  StickyNote,
  Wallet,
  X,
} from 'lucide-react'
import { useWizard } from '../WizardContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RichTextEditor } from '@/components/ui/rich-text-editor-lazy'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/validations/proposals'
import { engagementLabel, ENGAGEMENT_TYPES } from '@/lib/validations/catalog'
import type { LineItemFormData } from '@/lib/validations/proposals'
import type { ServiceOption } from '@/lib/actions/proposals'

export function Step2Services() {
  const { form, services } = useWizard()
  const { control, watch } = form
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'lineItems',
  })

  const lineItems = watch('lineItems')
  const [searchQuery, setSearchQuery] = useState('')
  const [showServicePicker, setShowServicePicker] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const addService = useCallback(
    (service: ServiceOption) => {
      // Quantity carries the engagement term so lineTotal = cost × term = Item Total
      const cost = parseFloat(service.defaultRate)
      const term = service.engagementTerm > 0 ? service.engagementTerm : 1
      const newItem: LineItemFormData = {
        id: crypto.randomUUID(),
        serviceId: service.id,
        customName: '',
        description: service.description,
        scopeOfWork: service.defaultScope,
        unit: service.unit,
        quantity: term,
        unitRate: cost,
        lineTotal: Math.round(cost * term * 100) / 100,
        isOptional: false,
        internalNote: '',
        // Seed internal project expenses from the catalog service (editable here)
        expenses: service.estimatedExpenses.map((e) => ({ ...e })),
        sortOrder: fields.length,
        serviceName: service.name,
        serviceMinRate: service.minRate ? parseFloat(service.minRate) : null,
      }
      append(newItem)
      setShowServicePicker(false)
      setSearchQuery('')
    },
    [append, fields.length],
  )

  const addCustomItem = useCallback(() => {
    const newItem: LineItemFormData = {
      id: crypto.randomUUID(),
      serviceId: null,
      customName: '',
      description: '',
      scopeOfWork: '',
      unit: 'one-time',
      quantity: 1,
      unitRate: 0,
      lineTotal: 0,
      isOptional: false,
      internalNote: '',
      expenses: [],
      sortOrder: fields.length,
      serviceName: '',
      serviceMinRate: null,
    }
    append(newItem)
  }, [append, fields.length])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = fields.findIndex((f) => f.id === active.id)
    const newIndex = fields.findIndex((f) => f.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      move(oldIndex, newIndex)
    }
  }

  // Group services by category for the picker
  const filteredServices = services.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase()),
  )
  const grouped = filteredServices.reduce<Record<string, ServiceOption[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {})

  // Already-added service IDs
  const addedServiceIds = new Set(lineItems?.map((li) => li.serviceId).filter(Boolean))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-primary)]">
          Service Selection
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Add services from the catalog or create custom line items.
        </p>
      </div>

      {/* Service picker */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
            />
            <Input
              placeholder="Search services by name or category..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                if (e.target.value) setShowServicePicker(true)
              }}
              onFocus={() => setShowServicePicker(true)}
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={addCustomItem}
            className="shrink-0"
          >
            <Plus size={16} className="mr-1" />
            Custom Item
          </Button>
        </div>

        {showServicePicker && (
          <div className="border border-[var(--color-border)] rounded-[var(--radius-sm)] bg-white shadow-lg max-h-64 overflow-y-auto">
            {Object.keys(grouped).length === 0 ? (
              <p className="px-4 py-3 text-sm text-[var(--color-muted)]">
                No services found.
              </p>
            ) : (
              Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <div className="px-4 py-2 text-xs font-semibold text-[var(--color-muted)] bg-slate-50 sticky top-0">
                    {category}
                  </div>
                  {items.map((service) => {
                    const alreadyAdded = addedServiceIds.has(service.id)
                    return (
                      <button
                        key={service.id}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => addService(service)}
                        className={cn(
                          'w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between min-h-[44px]',
                          alreadyAdded && 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <div>
                          <p className="text-sm font-medium">{service.name}</p>
                          <p className="text-xs text-[var(--color-muted)] tabular-nums">
                            {engagementLabel(service.unit)} ·{' '}
                            {formatCurrency(parseFloat(service.defaultRate))}
                            {service.engagementTerm > 1
                              ? ` × ${service.engagementTerm} months`
                              : ''}
                            {' = '}
                            {formatCurrency(
                              parseFloat(service.defaultRate) *
                                (service.engagementTerm > 0 ? service.engagementTerm : 1),
                            )}
                          </p>
                        </div>
                        {alreadyAdded && (
                          <span className="text-xs text-[var(--color-muted)]">Added</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
            <button
              type="button"
              onClick={() => setShowServicePicker(false)}
              className="w-full px-4 py-2 text-xs text-[var(--color-muted)] hover:bg-slate-50 border-t"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Line items */}
      {fields.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)]">
          <p className="text-sm text-[var(--color-muted)]">
            No services added yet. Search above or add a custom item.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={fields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {fields.map((field, index) => (
                <SortableLineItemCard
                  key={field.id}
                  id={field.id}
                  index={index}
                  form={form}
                  onRemove={() => remove(index)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {fields.length > 0 && (
        <p className="text-xs text-[var(--color-muted)]">
          Drag items to reorder. {fields.length} item{fields.length !== 1 ? 's' : ''} total.
        </p>
      )}
    </div>
  )
}

// ─── Sortable Line Item Card ─────────────────────────────────────────────────

function SortableLineItemCard({
  id,
  index,
  form,
  onRemove,
}: {
  id: string
  index: number
  form: ReturnType<typeof useWizard>['form']
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const { register, setValue, watch, control } = form
  const [expanded, setExpanded] = useState(true)
  const [showInternalNote, setShowInternalNote] = useState(false)

  const {
    fields: expenseFields,
    append: appendExpense,
    remove: removeExpense,
  } = useFieldArray({ control, name: `lineItems.${index}.expenses` })

  const item = watch(`lineItems.${index}`)
  const isCustom = !item?.serviceId
  const serviceName = item?.serviceName || item?.customName || 'Custom Item'
  const quantity = item?.quantity ?? 1
  const unitRate = item?.unitRate ?? 0
  const lineTotal = quantity * unitRate
  const isBelowFloor =
    item?.serviceMinRate != null && unitRate < item.serviceMinRate

  const expensesTotal = (item?.expenses ?? []).reduce(
    (sum, e) => sum + (Number.isFinite(e?.amount) ? e.amount : 0),
    0,
  )

  // Auto-compute lineTotal
  const updateLineTotal = useCallback(
    (qty: number, rate: number) => {
      setValue(`lineItems.${index}.lineTotal`, qty * rate)
    },
    [setValue, index],
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'border rounded-[var(--radius-sm)] bg-white transition-shadow',
        isDragging ? 'shadow-lg opacity-90 z-10' : 'shadow-sm',
        isBelowFloor ? 'border-amber-300' : 'border-[var(--color-border)]',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)]">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-[var(--color-muted)] hover:text-[var(--color-primary)] min-h-[44px] min-w-[44px] flex items-center justify-center -ml-1"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 flex-1 min-h-[44px] text-left"
          aria-label={expanded ? 'Collapse item' : 'Expand item'}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{serviceName}</p>
            {!expanded && (
              <p className="text-xs text-[var(--color-muted)] tabular-nums">
                {engagementLabel(item?.unit ?? '')} · {formatCurrency(unitRate)} × {quantity} ={' '}
                {formatCurrency(lineTotal)}
              </p>
            )}
          </div>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`optional-${index}`} className="text-xs text-[var(--color-muted)]">
              Optional
            </Label>
            <Switch
              id={`optional-${index}`}
              checked={item?.isOptional ?? false}
              onCheckedChange={(checked) => setValue(`lineItems.${index}.isOptional`, checked)}
            />
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors"
            aria-label="Remove item"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Body (collapsible) */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Below-floor warning */}
          {isBelowFloor && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-[var(--radius-sm)] text-amber-700">
              <AlertTriangle size={14} />
              <span className="text-xs">
                Rate is below the minimum floor ({formatCurrency(item.serviceMinRate!)}). This requires manager approval.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Custom name (only for custom items) */}
            {isCustom && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`customName-${index}`}>Item Name *</Label>
                <Input
                  id={`customName-${index}`}
                  placeholder="e.g. Custom Deliverable"
                  {...register(`lineItems.${index}.customName`)}
                  onChange={(e) => {
                    register(`lineItems.${index}.customName`).onChange(e)
                    setValue(`lineItems.${index}.serviceName`, e.target.value)
                  }}
                />
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`description-${index}`}>Description *</Label>
              <Input
                id={`description-${index}`}
                placeholder="Brief description"
                {...register(`lineItems.${index}.description`)}
              />
            </div>

            {/* Scope of Work */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`scopeOfWork-${index}`}>Scope of Work</Label>
              <RichTextEditor
                value={item?.scopeOfWork ?? ''}
                onChange={(html) => setValue(`lineItems.${index}.scopeOfWork`, html)}
                placeholder="Describe the scope of work..."
              />
            </div>

            {/* Engagement Type */}
            <div className="space-y-1.5">
              <Label htmlFor={`unit-${index}`}>Engagement Type</Label>
              {isCustom ? (
                <Select
                  value={
                    item?.unit === 'one-time' || item?.unit === 'monthly' ? item.unit : ''
                  }
                  onValueChange={(v) => {
                    setValue(`lineItems.${index}.unit`, v)
                    if (v === 'one-time') {
                      setValue(`lineItems.${index}.quantity`, 1)
                      updateLineTotal(1, unitRate)
                    }
                  }}
                >
                  <SelectTrigger id={`unit-${index}`} className="min-h-[44px]">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ENGAGEMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`unit-${index}`}
                  value={engagementLabel(item?.unit ?? '')}
                  readOnly
                  className="bg-slate-50"
                />
              )}
            </div>

            {/* Engagement Term */}
            <div className="space-y-1.5">
              <Label htmlFor={`quantity-${index}`}>Engagement Term</Label>
              <Input
                id={`quantity-${index}`}
                type="number"
                step="1"
                min="1"
                {...register(`lineItems.${index}.quantity`, {
                  valueAsNumber: true,
                  onChange: (e) => {
                    const qty = parseFloat(e.target.value) || 0
                    updateLineTotal(qty, unitRate)
                  },
                })}
              />
              <p className="text-xs text-[var(--color-muted)]">
                {item?.unit === 'monthly' ? 'Number of months.' : 'Defaults to 1 for one-time.'}
              </p>
            </div>

            {/* Item Cost */}
            <div className="space-y-1.5">
              <Label htmlFor={`unitRate-${index}`}>Item Cost</Label>
              <Input
                id={`unitRate-${index}`}
                type="number"
                step="0.01"
                min="0"
                {...register(`lineItems.${index}.unitRate`, {
                  valueAsNumber: true,
                  onChange: (e) => {
                    const rate = parseFloat(e.target.value) || 0
                    updateLineTotal(quantity, rate)
                  },
                })}
              />
            </div>

            {/* Item Total (read-only) */}
            <div className="space-y-1.5">
              <Label htmlFor={`lineTotal-${index}`}>Item Total</Label>
              <Input
                id={`lineTotal-${index}`}
                value={formatCurrency(lineTotal)}
                readOnly
                className="bg-slate-50 font-medium"
              />
              <p className="text-xs text-[var(--color-muted)]">Item Cost × Engagement Term</p>
            </div>
          </div>

          {/* Project Expenses (internal only) */}
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50/60 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Wallet size={15} className="mt-0.5 text-[var(--color-muted)] shrink-0" />
              <div>
                <p className="text-sm font-medium text-[var(--color-primary)]">
                  Project Expenses
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  Internal guide only — never shown to the client or on the PDF. Used to
                  track project cost and profitability.
                </p>
              </div>
            </div>

            {expenseFields.length > 0 && (
              <div className="space-y-2">
                {expenseFields.map((expenseField, i) => (
                  <div key={expenseField.id} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <Label
                        htmlFor={`expense-label-${index}-${i}`}
                        className="sr-only"
                      >
                        Expense {i + 1} description
                      </Label>
                      <Input
                        id={`expense-label-${index}-${i}`}
                        placeholder="e.g. Media buy, talent fee…"
                        {...register(`lineItems.${index}.expenses.${i}.label`)}
                      />
                    </div>
                    <div className="w-32 sm:w-36 space-y-1">
                      <Label
                        htmlFor={`expense-amount-${index}-${i}`}
                        className="sr-only"
                      >
                        Expense {i + 1} amount
                      </Label>
                      <Input
                        id={`expense-amount-${index}-${i}`}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        {...register(`lineItems.${index}.expenses.${i}.amount`, {
                          setValueAs: (v) =>
                            v === '' || v == null ? 0 : Number(v),
                        })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExpense(i)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors shrink-0"
                      aria-label={`Remove expense ${i + 1}`}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 min-h-[36px] bg-white"
                onClick={() => appendExpense({ label: '', amount: 0 })}
              >
                <Plus size={14} />
                Add expense
              </Button>
              {expensesTotal > 0 && (
                <p className="text-xs text-[var(--color-muted)] tabular-nums">
                  Total expenses:{' '}
                  <span className="font-semibold text-[var(--color-primary)]">
                    {formatCurrency(expensesTotal)}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Internal Note toggle */}
          <button
            type="button"
            onClick={() => setShowInternalNote(!showInternalNote)}
            className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors min-h-[44px]"
          >
            <StickyNote size={14} />
            {showInternalNote ? 'Hide internal note' : 'Add internal note'}
          </button>

          {showInternalNote && (
            <div className="space-y-1.5">
              <Label htmlFor={`internalNote-${index}`}>Internal Note</Label>
              <Input
                id={`internalNote-${index}`}
                placeholder="Not visible to client"
                {...register(`lineItems.${index}.internalNote`)}
              />
              <p className="text-xs text-[var(--color-muted)]">
                This note will not appear in the proposal PDF.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
