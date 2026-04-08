'use client'

import { useWizard } from '../WizardContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  computeSubtotal,
  computeDiscount,
  computeTotal,
  formatCurrency,
} from '@/lib/validations/proposals'

const CURRENCIES = [
  { value: 'PHP', label: 'PHP (₱)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
]

export function Step3Pricing() {
  const { form } = useWizard()
  const { register, setValue, watch } = form

  const lineItems = watch('lineItems') ?? []
  const discountType = watch('discountType')
  const discountValue = watch('discountValue')
  const discountLabel = watch('discountLabel')
  const vatEnabled = watch('vatEnabled')
  const vatRate = watch('vatRate')
  const currency = watch('currency')

  const subtotal = computeSubtotal(lineItems)
  const discount = computeDiscount(subtotal, discountType, discountValue)
  const afterDiscount = subtotal - discount
  const vatAmount = vatEnabled ? afterDiscount * (vatRate / 100) : 0
  const total = computeTotal({ lineItems, discountType, discountValue, vatEnabled, vatRate })

  const optionalTotal = lineItems
    .filter((li) => li.isOptional)
    .reduce((sum, li) => sum + li.lineTotal, 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-primary)]">
          Pricing Summary
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Configure discounts, VAT, and review the total.
        </p>
      </div>

      {/* Pricing breakdown */}
      <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
        {/* Subtotal */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
          <span className="text-sm font-medium">Subtotal</span>
          <span className="text-sm font-semibold">{formatCurrency(subtotal, currency)}</span>
        </div>

        {/* Optional items note */}
        {optionalTotal > 0 && (
          <div className="flex items-center justify-between px-4 py-2 text-xs text-[var(--color-muted)] border-t border-[var(--color-border)]">
            <span>Optional add-ons (not in subtotal)</span>
            <span>{formatCurrency(optionalTotal, currency)}</span>
          </div>
        )}

        {/* Discount section */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Discount</span>
            <div className="flex items-center gap-2">
              <Select
                value={discountType ?? 'none'}
                onValueChange={(val) => {
                  if (val === 'none') {
                    setValue('discountType', null)
                    setValue('discountValue', null)
                  } else {
                    setValue('discountType', val as 'percentage' | 'fixed')
                    if (!discountValue) setValue('discountValue', 0)
                  }
                }}
              >
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No discount</SelectItem>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {discountType && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="discountValue">
                  {discountType === 'percentage' ? 'Discount %' : 'Discount Amount'}
                </Label>
                <Input
                  id="discountValue"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('discountValue', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="discountLabel">Discount Label</Label>
                <Input
                  id="discountLabel"
                  placeholder="e.g. Early-bird discount"
                  value={discountLabel}
                  onChange={(e) => setValue('discountLabel', e.target.value)}
                />
              </div>
            </div>
          )}

          {discount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-muted)]">
                {discountLabel || 'Discount'}
                {discountType === 'percentage' ? ` (${discountValue}%)` : ''}
              </span>
              <span className="text-[var(--color-danger)] font-medium">
                -{formatCurrency(discount, currency)}
              </span>
            </div>
          )}
        </div>

        {/* After discount */}
        {discount > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] text-sm">
            <span className="text-[var(--color-muted)]">After Discount</span>
            <span className="font-medium">{formatCurrency(afterDiscount, currency)}</span>
          </div>
        )}

        {/* VAT section */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="vatToggle" className="text-sm font-medium">
                VAT
              </Label>
              <Switch
                id="vatToggle"
                checked={vatEnabled}
                onCheckedChange={(checked) => setValue('vatEnabled', checked)}
              />
            </div>
            {vatEnabled && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-20 h-9 text-right"
                  {...register('vatRate', { valueAsNumber: true })}
                />
                <span className="text-sm text-[var(--color-muted)]">%</span>
              </div>
            )}
          </div>
          {vatEnabled && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-muted)]">
                VAT ({vatRate}%)
              </span>
              <span className="font-medium">
                +{formatCurrency(vatAmount, currency)}
              </span>
            </div>
          )}
        </div>

        {/* Grand Total */}
        <div className="flex items-center justify-between px-4 py-4 border-t-2 border-[var(--color-primary)] bg-slate-50">
          <span className="text-base font-bold text-[var(--color-primary)]">
            Grand Total
          </span>
          <span className="text-xl font-bold text-[var(--color-accent)]">
            {formatCurrency(total, currency)}
          </span>
        </div>
      </div>

      {/* Currency selector */}
      <div className="space-y-1.5">
        <Label htmlFor="currency">Currency</Label>
        <Select
          value={currency}
          onValueChange={(val) => setValue('currency', val)}
        >
          <SelectTrigger id="currency" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Pricing Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="pricingNotes">Pricing Notes</Label>
        <Textarea
          id="pricingNotes"
          placeholder="Any additional notes about pricing (visible to client)..."
          {...register('pricingNotes')}
          rows={3}
        />
      </div>
    </div>
  )
}
