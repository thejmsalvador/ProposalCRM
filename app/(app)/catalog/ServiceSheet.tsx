'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm, Controller, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, RotateCcw, Plus, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RichTextEditor } from '@/components/ui/rich-text-editor-lazy'
import {
  serviceSchema,
  ENGAGEMENT_TYPES,
  type ServiceInput,
} from '@/lib/validations/catalog'
import { formatCurrency } from '@/lib/validations/proposals'
import { createService, updateService, archiveService, restoreService } from '@/lib/actions/catalog'
import type { ServiceListItem, TemplateOption } from '@/lib/actions/catalog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: ServiceListItem | null
  categories: string[]
  paymentTemplates: TemplateOption[]
  tcTemplates: TemplateOption[]
}

const NONE = '__none__'
const ADD_NEW_CATEGORY = '__add_new_category__'

type EngagementValue = ServiceInput['unit']

function toEngagementType(unit: string): EngagementValue | undefined {
  return unit === 'one-time' || unit === 'monthly' ? unit : undefined
}

const EMPTY_EXPENSE = { label: '', amount: 0 }

export function ServiceSheet({
  open,
  onOpenChange,
  service,
  categories,
  paymentTemplates,
  tcTemplates,
}: Props) {
  const isEdit = !!service
  const [, startTransition] = useTransition()
  const [categoryInput, setCategoryInput] = useState('')
  const [addingNewCategory, setAddingNewCategory] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ServiceInput>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '',
      category: '',
      description: '',
      defaultScope: '',
      unit: undefined,
      engagementTerm: 1,
      defaultRate: 0,
      estimatedExpenses: [{ ...EMPTY_EXPENSE }],
      paymentTplId: null,
      tcTemplateId: null,
      internalNotes: null,
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'estimatedExpenses' })

  useEffect(() => {
    if (open) {
      if (service) {
        reset({
          name: service.name,
          category: service.category,
          description: service.description,
          defaultScope: service.defaultScope,
          unit: toEngagementType(service.unit),
          engagementTerm: service.engagementTerm,
          defaultRate: parseFloat(service.defaultRate),
          estimatedExpenses:
            service.estimatedExpenses.length > 0
              ? service.estimatedExpenses
              : [{ ...EMPTY_EXPENSE }],
          paymentTplId: service.paymentTplId ?? null,
          tcTemplateId: service.tcTemplateId ?? null,
          internalNotes: service.internalNotes ?? null,
        })
        setCategoryInput(service.category)
        // Existing category not yet in the known list → show the free-text field
        setAddingNewCategory(!categories.includes(service.category))
      } else {
        reset({
          name: '',
          category: '',
          description: '',
          defaultScope: '',
          unit: undefined,
          engagementTerm: 1,
          defaultRate: 0,
          estimatedExpenses: [{ ...EMPTY_EXPENSE }],
          paymentTplId: null,
          tcTemplateId: null,
          internalNotes: null,
        })
        setCategoryInput('')
        // No categories yet → fall back to free-text entry
        setAddingNewCategory(categories.length === 0)
      }
    }
  }, [open, service, reset, categories])

  // Live values for the computed Item Total
  const engagementType = watch('unit')
  const engagementTerm = watch('engagementTerm')
  const itemCost = watch('defaultRate')
  const expenses = watch('estimatedExpenses')

  const safeCost = Number.isFinite(itemCost) ? itemCost : 0
  const safeTerm = Number.isFinite(engagementTerm) ? engagementTerm : 0
  const itemTotal = safeCost * safeTerm
  const expensesTotal = (expenses ?? []).reduce(
    (sum, e) => sum + (Number.isFinite(e?.amount) ? e.amount : 0),
    0,
  )

  // Legacy free-text units (pre-engagement-type) need an explicit choice
  const legacyUnit = isEdit && !toEngagementType(service!.unit) ? service!.unit : null

  async function onSubmit(data: ServiceInput) {
    const payload: ServiceInput = {
      ...data,
      estimatedExpenses: (data.estimatedExpenses ?? []).map((e) => ({
        label: e.label.trim(),
        amount: e.amount,
      })),
    }
    const result = isEdit
      ? await updateService(service!.id, payload)
      : await createService(payload)

    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: isEdit ? 'Service updated' : 'Service created' })
      onOpenChange(false)
    }
  }

  // Drop fully-empty expense rows before validation so the default blank row
  // doesn't block saving
  function submitForm() {
    const current = getValues('estimatedExpenses') ?? []
    const pruned = current.filter(
      (e) => e.label.trim() !== '' || (Number.isFinite(e.amount) && e.amount > 0),
    )
    if (pruned.length !== current.length) {
      setValue('estimatedExpenses', pruned)
    }
    void handleSubmit(onSubmit)()
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveService(service!.id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Service archived' })
        onOpenChange(false)
      }
    })
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreService(service!.id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Service restored' })
        onOpenChange(false)
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-6 py-5 border-b border-[var(--color-border)] shrink-0">
          <SheetTitle>{isEdit ? 'Edit Service' : 'Add Service'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update the service details. Changes apply to future proposals only.'
              : 'Add a new service to the catalog.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Service name */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-name">Service Name *</Label>
            <Input
              id="svc-name"
              {...register('name')}
              placeholder="e.g. Brand Strategy Consulting"
            />
            {errors.name && (
              <p className="text-xs text-[var(--color-danger)]">{errors.name.message}</p>
            )}
          </div>

          {/* Service category — pick an existing one or add a new entry */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-category">Service Category *</Label>
            {addingNewCategory ? (
              <div className="space-y-1.5">
                <Input
                  id="svc-category"
                  value={categoryInput}
                  onChange={(e) => {
                    setCategoryInput(e.target.value)
                    setValue('category', e.target.value, { shouldValidate: true })
                  }}
                  placeholder="e.g. Strategy, Digital, Production…"
                  autoComplete="off"
                />
                {categories.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-[var(--color-accent)] hover:underline"
                    onClick={() => {
                      setAddingNewCategory(false)
                      setCategoryInput('')
                      setValue('category', '', { shouldValidate: true })
                    }}
                  >
                    ← Choose an existing category
                  </button>
                )}
                <p className="text-xs text-[var(--color-muted)]">
                  New categories are saved and become reusable from the dropdown.
                </p>
              </div>
            ) : (
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value || ''}
                    onValueChange={(v) => {
                      if (v === ADD_NEW_CATEGORY) {
                        setAddingNewCategory(true)
                        setCategoryInput('')
                        field.onChange('')
                        return
                      }
                      field.onChange(v)
                    }}
                  >
                    <SelectTrigger id="svc-category" className="min-h-[44px]">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                      <SelectItem
                        value={ADD_NEW_CATEGORY}
                        className="text-[var(--color-accent)] font-medium"
                      >
                        + Add new category…
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            {errors.category && (
              <p className="text-xs text-[var(--color-danger)]">{errors.category.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-description">Short description *</Label>
            <Textarea
              id="svc-description"
              {...register('description')}
              placeholder="Visible on proposal line items"
              rows={2}
            />
            {errors.description && (
              <p className="text-xs text-[var(--color-danger)]">{errors.description.message}</p>
            )}
          </div>

          {/* Default scope of work */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-scope">Default scope of work *</Label>
            <p className="text-xs text-[var(--color-muted)]">
              Pre-fills the editable scope block when this service is added to a proposal.
            </p>
            <Controller
              name="defaultScope"
              control={control}
              render={({ field }) => (
                <RichTextEditor
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Describe the scope of work…"
                />
              )}
            />
            {errors.defaultScope && (
              <p className="text-xs text-[var(--color-danger)]">{errors.defaultScope.message}</p>
            )}
          </div>

          {/* Engagement type + term */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="svc-engagement-type">Engagement Type *</Label>
              <Controller
                name="unit"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => {
                      field.onChange(v as EngagementValue)
                      if (v === 'one-time') {
                        setValue('engagementTerm', 1, { shouldValidate: true })
                      }
                    }}
                  >
                    <SelectTrigger id="svc-engagement-type" className="min-h-[44px]">
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
                )}
              />
              {legacyUnit && !engagementType && (
                <p className="text-xs text-amber-700">
                  Previously &ldquo;{legacyUnit}&rdquo; — choose an engagement type.
                </p>
              )}
              {errors.unit && (
                <p className="text-xs text-[var(--color-danger)]">{errors.unit.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-engagement-term">Engagement Term *</Label>
              <Input
                id="svc-engagement-term"
                type="number"
                min={1}
                step={1}
                {...register('engagementTerm', { valueAsNumber: true })}
              />
              <p className="text-xs text-[var(--color-muted)]">
                {engagementType === 'monthly' ? 'Number of months.' : 'Defaults to 1 for one-time.'}
              </p>
              {errors.engagementTerm && (
                <p className="text-xs text-[var(--color-danger)]">
                  {errors.engagementTerm.message}
                </p>
              )}
            </div>
          </div>

          {/* Item cost */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-default-rate">Item Cost *</Label>
            <Input
              id="svc-default-rate"
              type="number"
              min={0}
              step="0.01"
              {...register('defaultRate', { valueAsNumber: true })}
              placeholder="0.00"
            />
            {errors.defaultRate && (
              <p className="text-xs text-[var(--color-danger)]">{errors.defaultRate.message}</p>
            )}
          </div>

          {/* Computed item total */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--color-primary)]">Item Total</p>
                <p className="text-xs text-[var(--color-muted)]">
                  Item Cost × Engagement Term
                  {engagementType === 'monthly' && safeTerm > 0
                    ? ` (${safeTerm} month${safeTerm !== 1 ? 's' : ''})`
                    : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[var(--color-primary)] tabular-nums">
                  {formatCurrency(itemTotal)}
                </p>
              </div>
            </div>
          </div>

          {/* Estimated project expenses */}
          <div className="space-y-2">
            <div>
              <Label>Estimated Project Expenses</Label>
              <p className="text-xs text-[var(--color-muted)]">
                Internal only — never shown to clients or on the proposal PDF. Used for project
                profitability.
              </p>
            </div>
            <div className="space-y-2">
              {fields.map((field, i) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input
                      {...register(`estimatedExpenses.${i}.label`)}
                      placeholder="e.g. Media buy, talent fee…"
                      aria-label={`Expense ${i + 1} description`}
                    />
                    {errors.estimatedExpenses?.[i]?.label && (
                      <p className="text-xs text-[var(--color-danger)]">
                        {errors.estimatedExpenses[i]?.label?.message}
                      </p>
                    )}
                  </div>
                  <div className="w-36 space-y-1">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      {...register(`estimatedExpenses.${i}.amount`, { valueAsNumber: true })}
                      placeholder="0.00"
                      aria-label={`Expense ${i + 1} amount`}
                    />
                    {errors.estimatedExpenses?.[i]?.amount && (
                      <p className="text-xs text-[var(--color-danger)]">
                        {errors.estimatedExpenses[i]?.amount?.message}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-[40px] min-w-[40px] p-0 shrink-0 text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                    aria-label={`Remove expense ${i + 1}`}
                    onClick={() => remove(i)}
                    disabled={fields.length === 1}
                  >
                    <X size={15} aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 min-h-[36px]"
                onClick={() => append({ ...EMPTY_EXPENSE })}
              >
                <Plus size={14} aria-hidden="true" />
                Add expense
              </Button>
              {expensesTotal > 0 && (
                <p className="text-xs text-[var(--color-muted)] tabular-nums">
                  Total estimated expenses:{' '}
                  <span className="font-semibold text-[var(--color-primary)]">
                    {formatCurrency(expensesTotal)}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Payment template */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-payment-tpl">Default payment template</Label>
            <Controller
              name="paymentTplId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                >
                  <SelectTrigger id="svc-payment-tpl" className="min-h-[44px]">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {paymentTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* T&C template */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-tc-tpl">Default T&C template</Label>
            <Controller
              name="tcTemplateId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                >
                  <SelectTrigger id="svc-tc-tpl" className="min-h-[44px]">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {tcTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Internal notes */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-notes">Internal notes</Label>
            <p className="text-xs text-[var(--color-muted)]">Not visible in proposals.</p>
            <Textarea
              id="svc-notes"
              {...register('internalNotes')}
              placeholder="Pricing guidance, target accounts, caveats…"
              rows={3}
            />
          </div>
        </div>

        <SheetFooter className="px-6 py-4 border-t border-[var(--color-border)] shrink-0 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {/* Archive / restore — only in edit mode */}
          {isEdit && (
            <div>
              {service!.isActive ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-[var(--color-danger)] hover:bg-red-50 min-h-[44px]"
                  onClick={handleArchive}
                >
                  <Archive size={14} />
                  Archive
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-[var(--color-success)] hover:bg-green-50 min-h-[44px]"
                  onClick={handleRestore}
                >
                  <RotateCcw size={14} />
                  Restore
                </Button>
              )}
            </div>
          )}

          <div className="flex gap-2 sm:ml-auto">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-[44px]"
              disabled={isSubmitting}
              onClick={submitForm}
            >
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add service'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
