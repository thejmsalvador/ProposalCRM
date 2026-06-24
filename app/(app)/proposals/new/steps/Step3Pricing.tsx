'use client'

import { useWizard } from '../WizardContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'JPY', label: 'JPY (¥)' },
  { value: 'AUD', label: 'AUD (A$)' },
  { value: 'CAD', label: 'CAD (C$)' },
  { value: 'SGD', label: 'SGD (S$)' },
  { value: 'HKD', label: 'HKD (HK$)' },
  { value: 'CNY', label: 'CNY (¥)' },
  { value: 'AED', label: 'AED (د.إ)' },
]

export function Step3Pricing() {
  const { form } = useWizard()
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form

  const lineItems = watch('lineItems') ?? []
  const discountType = watch('discountType')
  const discountValue = watch('discountValue')
  const discountLabel = watch('discountLabel')
  const vatEnabled = watch('vatEnabled')
  const vatRate = watch('vatRate')
  const currency = watch('currency')
  const exchangeRate = watch('exchangeRate')

  const subtotal = computeSubtotal(lineItems)
  const discount = computeDiscount(subtotal, discountType, discountValue)
  const afterDiscount = subtotal - discount
  const vatAmount = vatEnabled ? afterDiscount * (vatRate / 100) : 0
  const total = computeTotal({ lineItems, discountType, discountValue, vatEnabled, vatRate })

  // Items are always costed in ₱. For non-PHP proposals the client-facing
  // Converted Grand Total = ₱ total ÷ rate (rate is ₱ per 1 unit of currency).
  const convertedTotal =
    currency !== 'PHP' && exchangeRate != null && exchangeRate > 0
      ? total / exchangeRate
      : null

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
          <span className="text-sm font-semibold">{formatCurrency(subtotal)}</span>
        </div>

        {/* Optional items note */}
        {optionalTotal > 0 && (
          <div className="flex items-center justify-between px-4 py-2 text-xs text-[var(--color-muted)] border-t border-[var(--color-border)]">
            <span>Optional add-ons (not in subtotal)</span>
            <span>{formatCurrency(optionalTotal)}</span>
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
                -{formatCurrency(discount)}
              </span>
            </div>
          )}
        </div>

        {/* After discount */}
        {discount > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] text-sm">
            <span className="text-[var(--color-muted)]">After Discount</span>
            <span className="font-medium">{formatCurrency(afterDiscount)}</span>
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
                +{formatCurrency(vatAmount)}
              </span>
            </div>
          )}
        </div>

        {/* Grand Total — items are always costed in ₱ */}
        <div className="flex items-center justify-between px-4 py-4 border-t-2 border-[var(--color-primary)] bg-slate-50">
          <span className="text-base font-bold text-[var(--color-primary)]">
            Grand Total (PHP)
          </span>
          <span className="text-xl font-bold text-[var(--color-accent)]">
            {formatCurrency(total)}
          </span>
        </div>

        {/* Converted Grand Total — client-facing figure for non-PHP proposals */}
        {currency !== 'PHP' && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-accent-light)]">
            <div>
              <span className="text-sm font-bold text-[var(--color-primary)]">
                Converted Grand Total ({currency})
              </span>
              <p className="text-xs text-[var(--color-muted)]">
                Shown to the client on the proposal PDF.
              </p>
            </div>
            {convertedTotal != null ? (
              <div className="text-right">
                <span className="text-lg font-bold text-[var(--color-accent)] tabular-nums">
                  {formatCurrency(convertedTotal, currency)}
                </span>
                <p className="text-xs text-[var(--color-muted)] tabular-nums">
                  {formatCurrency(total)} ÷ ₱{exchangeRate!.toLocaleString('en-PH')} per 1{' '}
                  {currency}
                </p>
              </div>
            ) : (
              <span className="text-sm font-medium text-amber-700">
                Set an exchange rate below
              </span>
            )}
          </div>
        )}
      </div>

      {/* Currency + exchange rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="currency">Client-facing Currency</Label>
          <p className="min-h-[2rem] text-xs text-[var(--color-muted)]">
            The currency presented to the client on the proposal PDF. Items are always costed
            in ₱.
          </p>
          <Select
            value={currency}
            onValueChange={(val) => {
              setValue('currency', val)
              if (val === 'PHP') setValue('exchangeRate', null)
            }}
          >
            <SelectTrigger id="currency" className="w-full">
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

        {currency !== 'PHP' && (
          <div className="space-y-1.5">
            <Label htmlFor="exchangeRate">Exchange Rate (₱ per 1 {currency})</Label>
            <p className="min-h-[2rem] text-xs text-[var(--color-muted)]">
              Converts the ₱ Grand Total into {currency} for the client-facing proposal.
            </p>
            <Input
              id="exchangeRate"
              type="number"
              step="any"
              min="0"
              placeholder={`₱ per 1 ${currency}`}
              {...register('exchangeRate', {
                setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
              })}
            />
            {errors.exchangeRate && (
              <p className="text-xs text-[var(--color-danger)]">
                {errors.exchangeRate.message}
              </p>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
