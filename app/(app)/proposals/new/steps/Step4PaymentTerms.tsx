'use client'

import { useWizard } from '../WizardContext'
import { sanitizeHtml } from '@/lib/sanitize'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RichTextEditor } from '@/components/ui/rich-text-editor-lazy'
import { MilestoneEditor } from '@/components/proposals/MilestoneEditor'
import { computeTotal, formatCurrency } from '@/lib/validations/proposals'

export function Step4PaymentTerms() {
  const { form, paymentTemplates, modesOfPayment } = useWizard()
  const {
    setValue,
    watch,
    formState: { errors },
  } = form

  const selectedId = watch('paymentTemplateId')
  const override = watch('paymentTermsOverride')
  const isOverriding = override !== null

  const selectedTemplate = paymentTemplates.find((t) => t.id === selectedId)

  // Grand total (₱) drives the per-milestone peso column.
  const values = watch()
  const grandTotal = computeTotal(values)

  // The proposal's schedule: an explicit override, or null = inherit the template's.
  const milestoneOverride = watch('paymentMilestones')
  const templateMilestones = selectedTemplate?.milestones ?? []
  // What's shown: the override when present, otherwise the template's default.
  const effectiveMilestones = milestoneOverride ?? templateMilestones

  // Calculation basis follows the same array in effect: the proposal's own when
  // overriding, otherwise the template's. null = inherit the template's basis.
  const basisOverride = watch('milestoneBasis')
  const effectiveBasis = basisOverride ?? selectedTemplate?.milestoneBasis ?? 'total'

  // Mode of Payment — multi-select of company bank accounts (order preserved).
  const selectedModes = watch('modesOfPayment') ?? []
  const selectedModeIds = new Set(selectedModes.map((m) => m.modeOfPaymentId))

  function toggleMode(id: string) {
    const next = selectedModeIds.has(id)
      ? selectedModes.filter((m) => m.modeOfPaymentId !== id)
      : [...selectedModes, { modeOfPaymentId: id }]
    setValue('modesOfPayment', next, { shouldDirty: true })
  }

  function handleTemplateChange(id: string) {
    setValue('paymentTemplateId', id)
    // Reset overrides when changing template so the new template's defaults apply.
    setValue('paymentTermsOverride', null)
    setValue('paymentMilestones', null)
    setValue('milestoneBasis', null)
  }

  // The single override toggle governs both the prose terms and the schedule:
  // turning it on copies the template's content so it can be customised for this
  // proposal; turning it off reverts to inheriting the template.
  function toggleOverride(checked: boolean) {
    if (checked) {
      setValue('paymentTermsOverride', selectedTemplate?.bodyRichText ?? '')
      setValue(
        'paymentMilestones',
        templateMilestones.map((m, i) => ({ id: `ms-${i}`, ...m })),
      )
      setValue('milestoneBasis', selectedTemplate?.milestoneBasis ?? 'total')
    } else {
      setValue('paymentTermsOverride', null)
      setValue('paymentMilestones', null)
      setValue('milestoneBasis', null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-primary)]">
          Payment Terms
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Pick a payment template — its schedule and terms apply by default. Override
          only if this proposal needs something different.
        </p>
      </div>

      {/* Template selector */}
      <div className="space-y-1.5">
        <Label htmlFor="paymentTemplate">Payment Template</Label>
        <Select value={selectedId} onValueChange={handleTemplateChange}>
          <SelectTrigger id="paymentTemplate">
            <SelectValue placeholder="Select payment terms..." />
          </SelectTrigger>
          <SelectContent>
            {paymentTemplates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
                {t.isDefault ? ' (Default)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedId && (
        <div className="text-center py-8 border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)]">
          <p className="text-sm text-[var(--color-muted)]">
            Select a payment terms template above to preview its schedule.
          </p>
        </div>
      )}

      {selectedTemplate && (
        <div className="space-y-5">
          {/* Override toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="paymentOverride"
              checked={isOverriding}
              onCheckedChange={toggleOverride}
            />
            <Label htmlFor="paymentOverride" className="text-sm">
              Override for this proposal
            </Label>
            {isOverriding && (
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                Custom terms — deviation from standard
              </Badge>
            )}
          </div>

          {/* Payment schedule */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Payment Schedule</Label>
              {!isOverriding && effectiveMilestones.length > 0 && (
                <span className="text-xs text-[var(--color-muted)]">Inherited from template</span>
              )}
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              ₱ amounts are computed from this proposal&apos;s{' '}
              <span className="font-medium">{formatCurrency(grandTotal)}</span> grand total.
            </p>

            {isOverriding ? (
              <MilestoneEditor
                milestones={milestoneOverride ?? []}
                onChange={(next) =>
                  setValue('paymentMilestones', next, { shouldDirty: true })
                }
                total={grandTotal}
                emptyHint="No milestones for this proposal. Add a breakdown, or leave empty to print the terms text as written."
                basis={effectiveBasis}
                onBasisChange={(b) => setValue('milestoneBasis', b, { shouldDirty: true })}
              />
            ) : effectiveMilestones.length > 0 ? (
              <MilestoneEditor
                milestones={effectiveMilestones.map((m, i) => ({ id: `t-${i}`, ...m }))}
                onChange={() => {}}
                total={grandTotal}
                basis={effectiveBasis}
                readOnly
              />
            ) : (
              <div className="text-center py-6 border border-dashed border-[var(--color-border)] rounded-[var(--radius-sm)]">
                <p className="text-sm text-[var(--color-muted)]">
                  This template has no payment schedule. Turn on override to add one for
                  this proposal, or it will print the terms text as written.
                </p>
              </div>
            )}
          </div>

          {/* Prose terms */}
          {isOverriding ? (
            <div className="space-y-1.5">
              <Label htmlFor="paymentOverrideEditor">
                Additional terms &amp; conditions
              </Label>
              <RichTextEditor
                value={override ?? ''}
                onChange={(html) => setValue('paymentTermsOverride', html)}
                placeholder="Edit payment terms..."
              />
            </div>
          ) : selectedTemplate.bodyRichText && selectedTemplate.bodyRichText !== '<p></p>' ? (
            <div className="space-y-1.5">
              <Label>Additional terms &amp; conditions</Label>
              <div
                className="prose prose-sm max-w-none px-4 py-3 bg-slate-50 rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedTemplate.bodyRichText) }}
              />
            </div>
          ) : null}
        </div>
      )}

      {/* Mode of Payment — multi-select of company bank accounts */}
      <fieldset className="space-y-3 border-t border-[var(--color-border)] pt-6">
        <legend className="contents">
          <h3 className="text-base font-semibold text-[var(--color-primary)]">
            Mode of Payment <span className="text-[var(--color-danger)]">*</span>
          </h3>
        </legend>
        <p className="text-sm text-[var(--color-muted)]">
          Select the bank account(s) the client can pay to. The chosen accounts appear on the
          proposal and PDF — pick the ones applicable to this client.
        </p>

        {modesOfPayment.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)]">
            <p className="text-sm text-[var(--color-muted)]">
              No payment accounts have been set up yet. An admin can add them under{' '}
              <span className="font-medium">Mode of Payment</span> in the sidebar.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {modesOfPayment.map((m) => {
              const checked = selectedModeIds.has(m.id)
              return (
                <label
                  key={m.id}
                  className={`flex items-start gap-3 rounded-[var(--radius-sm)] border px-4 py-3 cursor-pointer transition-colors min-h-[44px] ${
                    checked
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-surface)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                    checked={checked}
                    onChange={() => toggleMode(m.id)}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-[var(--color-primary)]">
                      {m.label}
                    </span>
                    <span className="block text-xs text-[var(--color-muted)]">
                      {m.bankName} · {m.accountName} · {m.accountNumber}
                      {m.branch ? ` · ${m.branch}` : ''}
                      {m.swiftCode ? ` · SWIFT ${m.swiftCode}` : ''}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        )}

        {selectedModes.length > 0 && (
          <p className="text-xs text-[var(--color-muted)]">
            {selectedModes.length} account{selectedModes.length !== 1 ? 's' : ''} selected
          </p>
        )}
        {typeof errors.modesOfPayment?.message === 'string' && (
          <p className="text-xs text-[var(--color-danger)]">{errors.modesOfPayment.message}</p>
        )}
      </fieldset>
    </div>
  )
}
