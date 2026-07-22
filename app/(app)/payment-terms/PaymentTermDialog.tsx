'use client'

import { useEffect, useTransition } from 'react'
import { useForm, Controller, type Resolver } from 'react-hook-form'
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
import { MilestoneEditor } from '@/components/proposals/MilestoneEditor'
import { paymentTermSchema, type PaymentTermInput } from '@/lib/validations/payment-terms'
import {
  createPaymentTerm,
  updatePaymentTerm,
  archivePaymentTerm,
  restorePaymentTerm,
} from '@/lib/actions/payment-terms'
import type { PaymentTermListItem } from '@/lib/actions/payment-terms'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: PaymentTermListItem | null
}

// Sample figure used purely to illustrate the ₱ split while authoring a template;
// real proposals compute the column from their own grand total.
const PREVIEW_TOTAL = 1_000_000

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
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PaymentTermInput>({
    // Cast: the schema's .default() makes zod's input type looser than its
    // output, but the form always supplies complete defaultValues
    resolver: zodResolver(paymentTermSchema) as Resolver<PaymentTermInput>,
    defaultValues: {
      name: '',
      bodyRichText: '',
      notesRichText: '',
      milestones: [],
      milestoneBasis: 'total',
      isDefault: false,
    },
  })

  useEffect(() => {
    if (open) {
      reset(
        template
          ? {
              name: template.name,
              bodyRichText: template.bodyRichText,
              notesRichText: template.notesRichText,
              milestones: template.milestones.map((m, i) => ({ id: `ms-${i}`, ...m })),
              milestoneBasis: template.milestoneBasis,
              isDefault: template.isDefault,
            }
          : {
              name: '',
              bodyRichText: '',
              notesRichText: '',
              milestones: [],
              milestoneBasis: 'total',
              isDefault: false,
            },
      )
    }
  }, [open, template, reset])

  const milestoneBasis = watch('milestoneBasis')

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
        className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0"
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

          {/* Payment schedule — primary content */}
          <div className="space-y-1.5">
            <Label>Payment Schedule</Label>
            <p className="text-xs text-[var(--color-muted)]">
              The default breakdown for proposals using this template. Choose how the
              percentages are calculated. The ₱ column previews a sample {peso(PREVIEW_TOTAL)}{' '}
              total — proposals compute it from their own grand total.
            </p>
            <Controller
              name="milestones"
              control={control}
              render={({ field }) => (
                <MilestoneEditor
                  milestones={field.value ?? []}
                  onChange={field.onChange}
                  total={PREVIEW_TOTAL}
                  amountLabel="₱ of sample total"
                  emptyHint="No schedule yet. Add milestones, or leave empty to print the terms text as written."
                  basis={milestoneBasis}
                  onBasisChange={(b) => setValue('milestoneBasis', b, { shouldDirty: true })}
                />
              )}
            />
            {typeof errors.milestones?.message === 'string' && (
              <p className="text-xs text-[var(--color-danger)]">{errors.milestones.message}</p>
            )}
          </div>

          {/* Body — optional supporting terms */}
          <div className="space-y-1.5">
            <Label htmlFor="pt-body">Additional terms &amp; conditions (optional)</Label>
            <p className="text-xs text-[var(--color-muted)]">
              Rich text — payment conditions, late fees, currency notes. Printed above the
              schedule on the proposal.
            </p>
            <Controller
              name="bodyRichText"
              control={control}
              render={({ field }) => (
                <RichTextEditor
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Describe any payment conditions…"
                />
              )}
            />
            {errors.bodyRichText && (
              <p className="text-xs text-[var(--color-danger)]">{errors.bodyRichText.message}</p>
            )}
          </div>

          {/* Payment notes — penalties, invoicing, printed after the schedule */}
          <div className="space-y-1.5">
            <Label htmlFor="pt-notes">Payment notes &amp; penalties (optional)</Label>
            <p className="text-xs text-[var(--color-muted)]">
              Rich text — invoicing, grace period, late-payment penalties, and similar
              conditions. Printed right after the payment schedule on the proposal.
            </p>
            <Controller
              name="notesRichText"
              control={control}
              render={({ field }) => (
                <RichTextEditor
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="e.g. Please settle within 15 days of invoice. Late payment incurs a 5% monthly penalty…"
                />
              )}
            />
            {errors.notesRichText && (
              <p className="text-xs text-[var(--color-danger)]">{errors.notesRichText.message}</p>
            )}
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
