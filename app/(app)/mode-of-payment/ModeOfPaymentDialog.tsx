'use client'

import { useEffect, useTransition } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
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
import { modeOfPaymentSchema, type ModeOfPaymentInput } from '@/lib/validations/mode-of-payment'
import {
  createModeOfPayment,
  updateModeOfPayment,
  archiveModeOfPayment,
  restoreModeOfPayment,
} from '@/lib/actions/mode-of-payment'
import type { ModeOfPaymentListItem } from '@/lib/actions/mode-of-payment'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: ModeOfPaymentListItem | null
}

const EMPTY: ModeOfPaymentInput = {
  label: '',
  bankName: '',
  accountName: '',
  accountNumber: '',
  branch: '',
  swiftCode: '',
}

export function ModeOfPaymentDialog({ open, onOpenChange, mode }: Props) {
  const isEdit = !!mode
  const [, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModeOfPaymentInput>({
    // Cast: the schema's .default() makes zod's input type looser than its output,
    // but the form always supplies complete defaultValues.
    resolver: zodResolver(modeOfPaymentSchema) as Resolver<ModeOfPaymentInput>,
    defaultValues: EMPTY,
  })

  useEffect(() => {
    if (open) {
      reset(
        mode
          ? {
              label: mode.label,
              bankName: mode.bankName,
              accountName: mode.accountName,
              accountNumber: mode.accountNumber,
              branch: mode.branch,
              swiftCode: mode.swiftCode,
            }
          : EMPTY,
      )
    }
  }, [open, mode, reset])

  async function onSubmit(data: ModeOfPaymentInput) {
    const result = isEdit
      ? await updateModeOfPayment(mode!.id, data)
      : await createModeOfPayment(data)

    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: isEdit ? 'Account updated' : 'Account added' })
      onOpenChange(false)
    }
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveModeOfPayment(mode!.id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Account archived' })
        onOpenChange(false)
      }
    })
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreModeOfPayment(mode!.id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Account restored' })
        onOpenChange(false)
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-6 py-5 border-b border-[var(--color-border)] shrink-0">
          <SheetTitle>{isEdit ? 'Edit Payment Account' : 'Add Payment Account'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update this bank account. Existing proposals referencing it pick up the changes.'
              : 'Add a company bank account that can be selected on proposals.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Label */}
          <div className="space-y-1.5">
            <Label htmlFor="mop-label">Label *</Label>
            <Input
              id="mop-label"
              {...register('label')}
              placeholder="e.g. Foreign Clients (BDO)"
            />
            <p className="text-xs text-[var(--color-muted)]">
              How this account is grouped/named when selecting it on a proposal.
            </p>
            {errors.label && (
              <p className="text-xs text-[var(--color-danger)]">{errors.label.message}</p>
            )}
          </div>

          {/* Bank name */}
          <div className="space-y-1.5">
            <Label htmlFor="mop-bank">Bank Name *</Label>
            <Input id="mop-bank" {...register('bankName')} placeholder="e.g. BDO" />
            {errors.bankName && (
              <p className="text-xs text-[var(--color-danger)]">{errors.bankName.message}</p>
            )}
          </div>

          {/* Account name */}
          <div className="space-y-1.5">
            <Label htmlFor="mop-acct-name">Account Name *</Label>
            <Input
              id="mop-acct-name"
              {...register('accountName')}
              placeholder="e.g. Sunday Elephant Creatives Inc."
            />
            {errors.accountName && (
              <p className="text-xs text-[var(--color-danger)]">{errors.accountName.message}</p>
            )}
          </div>

          {/* Account number */}
          <div className="space-y-1.5">
            <Label htmlFor="mop-acct-no">Account No. *</Label>
            <Input
              id="mop-acct-no"
              {...register('accountNumber')}
              placeholder="e.g. 4170269821"
            />
            {errors.accountNumber && (
              <p className="text-xs text-[var(--color-danger)]">{errors.accountNumber.message}</p>
            )}
          </div>

          {/* Branch */}
          <div className="space-y-1.5">
            <Label htmlFor="mop-branch">Branch</Label>
            <Input id="mop-branch" {...register('branch')} placeholder="e.g. Reposo, Makati" />
          </div>

          {/* SWIFT code */}
          <div className="space-y-1.5">
            <Label htmlFor="mop-swift">SWIFT Code</Label>
            <Input id="mop-swift" {...register('swiftCode')} placeholder="e.g. BNORPHMM" />
            <p className="text-xs text-[var(--color-muted)]">
              Required for foreign/international transfers; leave blank for local accounts.
            </p>
          </div>
        </div>

        <SheetFooter className="px-6 py-4 border-t border-[var(--color-border)] shrink-0 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {isEdit && (
            <div>
              {!mode!.isArchived ? (
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
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add account'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
