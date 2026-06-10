'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, RotateCcw } from 'lucide-react'
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
import { serviceSchema, type ServiceInput } from '@/lib/validations/catalog'
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
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ServiceInput>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '',
      category: '',
      description: '',
      defaultScope: '',
      unit: '',
      defaultRate: 0,
      minRate: null,
      maxRate: null,
      paymentTplId: null,
      tcTemplateId: null,
      internalNotes: null,
    },
  })

  useEffect(() => {
    if (open) {
      if (service) {
        reset({
          name: service.name,
          category: service.category,
          description: service.description,
          defaultScope: service.defaultScope,
          unit: service.unit,
          defaultRate: parseFloat(service.defaultRate),
          minRate: service.minRate ? parseFloat(service.minRate) : null,
          maxRate: service.maxRate ? parseFloat(service.maxRate) : null,
          paymentTplId: service.paymentTplId ?? null,
          tcTemplateId: service.tcTemplateId ?? null,
          internalNotes: service.internalNotes ?? null,
        })
        setCategoryInput(service.category)
      } else {
        reset({
          name: '',
          category: '',
          description: '',
          defaultScope: '',
          unit: '',
          defaultRate: 0,
          minRate: null,
          maxRate: null,
          paymentTplId: null,
          tcTemplateId: null,
          internalNotes: null,
        })
        setCategoryInput('')
      }
    }
  }, [open, service, reset])

  const filteredSuggestions = categories.filter(
    (c) => c.toLowerCase().includes(categoryInput.toLowerCase()) && c !== categoryInput,
  )

  async function onSubmit(data: ServiceInput) {
    const result = isEdit
      ? await updateService(service!.id, data)
      : await createService(data)

    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: isEdit ? 'Service updated' : 'Service created' })
      onOpenChange(false)
    }
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
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-name">Name *</Label>
            <Input
              id="svc-name"
              {...register('name')}
              placeholder="e.g. Brand Strategy Consulting"
            />
            {errors.name && (
              <p className="text-xs text-[var(--color-danger)]">{errors.name.message}</p>
            )}
          </div>

          {/* Category with autocomplete */}
          <div className="space-y-1.5 relative">
            <Label htmlFor="svc-category">Category *</Label>
            <Input
              id="svc-category"
              value={categoryInput}
              onChange={(e) => {
                setCategoryInput(e.target.value)
                setValue('category', e.target.value, { shouldValidate: true })
                setShowCategorySuggestions(true)
              }}
              onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 150)}
              onFocus={() => setShowCategorySuggestions(true)}
              placeholder="e.g. Strategy, Digital, Production…"
              autoComplete="off"
            />
            {showCategorySuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[var(--color-border)] rounded-md shadow-md overflow-hidden">
                {filteredSuggestions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-surface)] text-[var(--color-primary)]"
                    onMouseDown={() => {
                      setCategoryInput(c)
                      setValue('category', c, { shouldValidate: true })
                      setShowCategorySuggestions(false)
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
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

          {/* Unit */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-unit">Unit *</Label>
            <Input
              id="svc-unit"
              {...register('unit')}
              placeholder="e.g. per campaign, per month, lump sum"
            />
            {errors.unit && (
              <p className="text-xs text-[var(--color-danger)]">{errors.unit.message}</p>
            )}
          </div>

          {/* Rates */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="svc-default-rate">Default rate *</Label>
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
            <div className="space-y-1.5">
              <Label htmlFor="svc-min-rate">Min rate</Label>
              <Input
                id="svc-min-rate"
                type="number"
                min={0}
                step="0.01"
                {...register('minRate', {
                  setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
                })}
                placeholder="Optional"
              />
              {errors.minRate && (
                <p className="text-xs text-[var(--color-danger)]">{errors.minRate.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-max-rate">Max rate</Label>
              <Input
                id="svc-max-rate"
                type="number"
                min={0}
                step="0.01"
                {...register('maxRate', {
                  setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
                })}
                placeholder="Optional"
              />
              {errors.maxRate && (
                <p className="text-xs text-[var(--color-danger)]">{errors.maxRate.message}</p>
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
              onClick={handleSubmit(onSubmit)}
            >
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add service'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
