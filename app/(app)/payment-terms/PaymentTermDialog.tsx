'use client'

import { useEffect, useMemo, useTransition } from 'react'
import { useForm, Controller, useWatch, type Resolver } from 'react-hook-form'
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
import { RichTextEditor } from '@/components/ui/rich-text-editor-lazy'
import { paymentTermSchema, type PaymentTermInput } from '@/lib/validations/payment-terms'
import {
  createPaymentTerm,
  updatePaymentTerm,
  archivePaymentTerm,
  restorePaymentTerm,
} from '@/lib/actions/payment-terms'
import type { PaymentTermListItem } from '@/lib/actions/payment-terms'
import { computePaymentSchedule, stripHtml } from '@/lib/payment-schedule'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: PaymentTermListItem | null
}

// Sample figures used purely to illustrate how a template breaks down in the editor.
const PREVIEW_TOTAL = 1_000_000
const PREVIEW_MONTHS = 12

function peso(n: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(n)
}

export function PaymentTermDialog({ open, onOpenChange, template }: Props) {
  const isEdit = !!template
  const [, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentTermInput>({
    // Cast: the schema's .default() makes zod's input type looser than its
    // output, but the form always supplies complete defaultValues
    resolver: zodResolver(paymentTermSchema) as Resolver<PaymentTermInput>,
    defaultValues: { name: '', bodyRichText: '', isDefault: false },
  })

  useEffect(() => {
    if (open) {
      reset(
        template
          ? { name: template.name, bodyRichText: template.bodyRichText, isDefault: template.isDefault }
          : { name: '', bodyRichText: '', isDefault: false },
      )
    }
  }, [open, template, reset])

  // Live schedule preview: recomputed from the terms text as the author edits it,
  // against a sample total so the resulting breakdown shape is visible while writing.
  const bodyValue = useWatch({ control, name: 'bodyRichText' })
  const previewSchedule = useMemo(
    () =>
      computePaymentSchedule({
        paymentText: stripHtml(bodyValue || ''),
        total: PREVIEW_TOTAL,
        engagementMonths: PREVIEW_MONTHS,
      }),
    [bodyValue],
  )

  async function onSubmit(data: PaymentTermInput) {
    const result = isEdit
      ? await updatePaymentTerm(template!.id, data)
      : await createPaymentTerm(data)

    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: isEdit ? 'Template updated' : 'Template created' })
      onOpenChange(false)
    }
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await archivePaymentTerm(template!.id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Template archived' })
        onOpenChange(false)
      }
    })
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restorePaymentTerm(template!.id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Template restored' })
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
          <SheetTitle>{isEdit ? 'Edit Payment Template' : 'Add Payment Template'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update the payment template. Existing proposals referencing this template are unaffected.'
              : 'Create a new reusable payment terms template.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="pt-name">Name *</Label>
            <Input id="pt-name" {...register('name')} placeholder="e.g. 50/50 Milestone" />
            {errors.name && (
              <p className="text-xs text-[var(--color-danger)]">{errors.name.message}</p>
            )}
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="pt-body">Payment terms *</Label>
            <p className="text-xs text-[var(--color-muted)]">
              Rich text — supports bold, italic, bullet lists.
            </p>
            <Controller
              name="bodyRichText"
              control={control}
              render={({ field }) => (
                <RichTextEditor
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Describe the payment schedule and conditions…"
                />
              )}
            />
            {errors.bodyRichText && (
              <p className="text-xs text-[var(--color-danger)]">{errors.bodyRichText.message}</p>
            )}
          </div>

          {/* Schedule preview */}
          <div className="space-y-1.5">
            <Label>Schedule preview</Label>
            <p className="text-xs text-[var(--color-muted)]">
              How this template breaks down a sample {peso(PREVIEW_TOTAL)} total
              {previewSchedule?.kind === 'monthly' ? ` over a ${PREVIEW_MONTHS}-month engagement` : ''}.
              Proposals compute this from their own grand total.
            </p>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              {previewSchedule ? (
                <div className="space-y-1.5">
                  {previewSchedule.installments.map((inst, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-[var(--color-primary)]">
                        {inst.label}
                        {inst.percent != null && (
                          <span className="text-[var(--color-muted)]"> · {inst.percent}%</span>
                        )}
                        {inst.downpaymentAmount ? (
                          <span className="text-[var(--color-muted)]">
                            {' '}
                            (incl. {inst.downpaymentPercent}% downpayment)
                          </span>
                        ) : null}
                      </span>
                      <span className="font-medium tabular-nums whitespace-nowrap">
                        {peso(inst.amount)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between gap-3 border-t border-[var(--color-border)] pt-1.5 text-sm font-semibold text-[var(--color-primary)]">
                    <span>Total</span>
                    <span className="tabular-nums whitespace-nowrap">{peso(previewSchedule.total)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--color-muted)]">
                  No automatic schedule detected — the terms will display as written. Mention a
                  percentage split (e.g. <span className="font-medium">50/50</span> or{' '}
                  <span className="font-medium">50-30-20</span>),{' '}
                  <span className="font-medium">monthly</span> billing, or a{' '}
                  <span className="font-medium">20% downpayment</span> to generate one.
                </p>
              )}
            </div>
          </div>

          {/* Set as default */}
          <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] px-4 py-3 bg-[var(--color-surface)]">
            <Controller
              name="isDefault"
              control={control}
              render={({ field }) => (
                <input
                  type="checkbox"
                  id="pt-default"
                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
              )}
            />
            <div>
              <Label htmlFor="pt-default" className="cursor-pointer font-medium">
                Set as default
              </Label>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                Pre-selected when creating new proposals. Only one template can be default.
              </p>
            </div>
          </div>
        </div>

        <SheetFooter className="px-6 py-4 border-t border-[var(--color-border)] shrink-0 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {isEdit && (
            <div>
              {!template!.isArchived ? (
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
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create template'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
