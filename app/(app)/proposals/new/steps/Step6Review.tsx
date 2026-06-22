'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2, AlertTriangle, Wallet } from 'lucide-react'
import { useWizard } from '../WizardContext'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  computeSubtotal,
  computeDiscount,
  computeTotal,
  formatCurrency,
  cleanPaymentMilestones,
} from '@/lib/validations/proposals'
import {
  milestonesPercentTotal,
  remainingTailPercentTotal,
  milestonesValidForBasis,
  computeMilestoneAmountsForBasis,
} from '@/lib/payment-schedule'
import { engagementLabel } from '@/lib/validations/catalog'

type CheckItem = {
  label: string
  passed: boolean
}

export function Step6Review() {
  const {
    form,
    saveDraft,
    submitForApproval,
    errorMessage,
    proposalNumber,
    paymentTemplates,
    tcTemplates,
    currentUser,
  } = useWizard()
  const { setValue, watch } = form
  const router = useRouter()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const data = watch()
  const confidentialWatermark = watch('confidentialWatermark')

  // Computed pricing
  const subtotal = computeSubtotal(data.lineItems)
  const discount = computeDiscount(subtotal, data.discountType, data.discountValue)
  const total = computeTotal(data)

  // Items are costed in ₱; non-PHP proposals get a client-facing converted
  // total = ₱ total ÷ rate (rate is ₱ per 1 unit of the currency).
  const exRate =
    data.currency !== 'PHP' && data.exchangeRate != null && data.exchangeRate > 0
      ? data.exchangeRate
      : null
  const convertedTotal = exRate != null ? total / exRate : null

  // Payment milestones (optional): the proposal's override when present, else the
  // selected template's default schedule. When present they must fully bill the total.
  const selectedPaymentTemplate = paymentTemplates.find((p) => p.id === data.paymentTemplateId)
  const templateMilestones = selectedPaymentTemplate?.milestones ?? []
  const milestones = cleanPaymentMilestones(data.paymentMilestones ?? templateMilestones)
  // Basis follows the schedule in effect: the proposal's own when overriding, else the template's.
  const effectiveBasis = data.milestoneBasis ?? selectedPaymentTemplate?.milestoneBasis ?? 'total'
  const hasMilestones = milestones.length > 0
  const milestonesBalanced = !hasMilestones || milestonesValidForBasis(milestones, effectiveBasis)
  const milestonePercentTotal = milestonesPercentTotal(milestones)
  const milestoneTailPercentTotal = remainingTailPercentTotal(milestones)
  const milestoneAmounts = hasMilestones
    ? computeMilestoneAmountsForBasis(milestones, total, effectiveBasis)
    : []

  // Validation checklist
  const checks: CheckItem[] = [
    { label: 'Client name provided', passed: data.clientName.length >= 2 },
    { label: 'Project title provided', passed: data.projectTitle.length >= 3 },
    { label: 'At least one service line item', passed: data.lineItems.length > 0 },
    { label: 'Total greater than 0', passed: total > 0 },
    ...(data.currency !== 'PHP'
      ? [
          {
            label: `Exchange rate set for ${data.currency}`,
            passed: data.exchangeRate != null && data.exchangeRate > 0,
          },
        ]
      : []),
    { label: 'Payment terms selected', passed: !!data.paymentTemplateId },
    ...(hasMilestones
      ? [
          {
            label:
              effectiveBasis === 'remaining'
                ? `Succeeding milestones total 100% of the remaining balance (currently ${milestoneTailPercentTotal}%)`
                : `Payment milestones total 100% (currently ${milestonePercentTotal}%)`,
            passed: milestonesBalanced,
          },
        ]
      : []),
    { label: 'Terms & conditions selected', passed: !!data.tcTemplateId },
  ]
  const allPassed = checks.every((c) => c.passed)

  // Below-floor pricing check
  const hasBelowFloor = data.lineItems.some(
    (li) => li.serviceMinRate != null && li.unitRate < li.serviceMinRate,
  )

  // Internal project expenses (sum per line item + overall total)
  const lineExpenseTotal = (li: (typeof data.lineItems)[number]) =>
    (li.expenses ?? []).reduce((s, e) => s + (Number.isFinite(e.amount) ? e.amount : 0), 0)
  const itemsWithExpenses = data.lineItems.filter((li) => lineExpenseTotal(li) > 0)
  const expensesTotal = data.lineItems.reduce((s, li) => s + lineExpenseTotal(li), 0)

  // Lookup references
  const paymentTemplate = paymentTemplates.find((p) => p.id === data.paymentTemplateId)
  const tcTemplate = tcTemplates.find((t) => t.id === data.tcTemplateId)

  async function handleSaveDraft() {
    setIsSaving(true)
    setSubmitError(null)
    await saveDraft()
    setIsSaving(false)
  }

  async function handleSubmit() {
    setIsSubmitting(true)
    setSubmitError(null)
    const result = await submitForApproval()
    if (result.success) {
      router.push('/proposals')
    } else {
      setSubmitError(result.error ?? 'Submission failed')
    }
    setIsSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-primary)]">
          Review & Submit
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Review the proposal details before submitting for approval.
        </p>
      </div>

      {/* Proposal preview */}
      <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
        {/* Header section */}
        <div className="px-6 py-4 bg-slate-50 border-b border-[var(--color-border)]">
          {proposalNumber && (
            <p className="text-xs text-[var(--color-muted)] font-mono mb-1">
              {proposalNumber}
            </p>
          )}
          <h3 className="text-lg font-bold text-[var(--color-primary)]">
            {data.projectTitle || 'Untitled Project'}
          </h3>
          {data.brandName && (
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              Brand: {data.brandName}
            </p>
          )}
          <p className="text-sm text-[var(--color-muted)] mt-0.5">
            Prepared for {data.clientName || '—'}
            {data.department ? ` — ${data.department}` : ''}
          </p>
          {data.contactName && (
            <p className="text-xs text-[var(--color-muted)]">
              Attn: {data.contactName}
              {data.contactTitle ? ` — ${data.contactTitle}` : ''}
            </p>
          )}
          {(data.contactEmail || data.contactPhone) && (
            <p className="text-xs text-[var(--color-muted)]">
              {[data.contactEmail, data.contactPhone].filter(Boolean).join(' · ')}
            </p>
          )}
          {data.businessAddress && (
            <p className="text-xs text-[var(--color-muted)]">
              {data.businessAddress}
            </p>
          )}
          {data.tin && (
            <p className="text-xs text-[var(--color-muted)]">TIN: {data.tin}</p>
          )}
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--color-border)]">
          <DetailCell label="Proposal Date" value={data.date || '—'} />
          <DetailCell label="Valid Until" value={data.validUntil || '—'} />
          <DetailCell label="Salesperson" value={currentUser.name} />
          <DetailCell label="Approver" value="Auto-assigned on submit" />
        </div>

        {/* Executive Summary */}
        {data.introText && data.introText !== '<p></p>' && (
          <div className="px-6 py-4 border-t border-[var(--color-border)]">
            <h4 className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">
              Executive Summary
            </h4>
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: data.introText }}
            />
          </div>
        )}

        {/* Line Items */}
        <div className="px-6 py-4 border-t border-[var(--color-border)]">
          <h4 className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">
            Services
          </h4>
          {data.lineItems.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No services added.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="text-left py-2 pr-4 font-medium text-[var(--color-muted)]">Service</th>
                    <th className="text-right py-2 px-2 font-medium text-[var(--color-muted)]">Type</th>
                    <th className="text-right py-2 px-2 font-medium text-[var(--color-muted)]">Term</th>
                    <th className="text-right py-2 px-2 font-medium text-[var(--color-muted)]">Item Cost</th>
                    <th className="text-right py-2 pl-2 font-medium text-[var(--color-muted)]">Item Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lineItems.map((li, idx) => (
                    <tr key={idx} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="py-2 pr-4">
                        <span className="font-medium">
                          {li.serviceName || li.customName || li.description}
                        </span>
                        {li.isOptional && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            Optional
                          </Badge>
                        )}
                      </td>
                      <td className="text-right py-2 px-2">{engagementLabel(li.unit)}</td>
                      <td className="text-right py-2 px-2">{li.quantity}</td>
                      <td className="text-right py-2 px-2">{formatCurrency(li.unitRate)}</td>
                      <td className="text-right py-2 pl-2 font-medium">{formatCurrency(li.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pricing summary */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] bg-slate-50 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-[var(--color-danger)]">
              <span>{data.discountLabel || 'Discount'}</span>
              <span>-{formatCurrency(discount)}</span>
            </div>
          )}
          {data.vatEnabled && (
            <div className="flex justify-between text-sm">
              <span>VAT ({data.vatRate}%)</span>
              <span>{formatCurrency((subtotal - discount) * (data.vatRate / 100))}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold pt-2 border-t border-[var(--color-border)]">
            <span>Total (PHP)</span>
            <span className="text-[var(--color-accent)]">{formatCurrency(total)}</span>
          </div>
          {convertedTotal != null && exRate != null && (
            <div className="flex justify-between items-baseline text-sm font-semibold">
              <span>Converted Total ({data.currency})</span>
              <span className="text-right">
                <span className="text-[var(--color-accent)] tabular-nums">
                  {formatCurrency(convertedTotal, data.currency)}
                </span>
                <span className="block text-xs font-normal text-[var(--color-muted)] tabular-nums">
                  ÷ ₱{exRate.toLocaleString('en-PH')} per 1 {data.currency}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Payment Terms */}
        {paymentTemplate && (
          <div className="px-6 py-4 border-t border-[var(--color-border)]">
            <h4 className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">
              Payment Terms
              {data.paymentTermsOverride && (
                <Badge className="ml-2 bg-amber-100 text-amber-700 hover:bg-amber-100">Customized</Badge>
              )}
            </h4>
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: data.paymentTermsOverride || paymentTemplate.bodyRichText,
              }}
            />

            {hasMilestones && (
              <div className="mt-4 overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-slate-50">
                      <th className="text-left py-2 px-3 font-medium text-[var(--color-muted)]">
                        Milestone
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-[var(--color-muted)]">
                        Due Date
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-[var(--color-muted)]">
                        %
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-[var(--color-muted)]">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map((m, i) => (
                      <tr
                        key={i}
                        className="border-b border-[var(--color-border)] last:border-0"
                      >
                        <td className="py-2 px-3 font-medium">{m.label || `Milestone ${i + 1}`}</td>
                        <td className="py-2 px-3 text-[var(--color-muted)]">{m.dueDate || '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{m.percent}%</td>
                        <td className="py-2 px-3 text-right tabular-nums font-medium">
                          {formatCurrency(milestoneAmounts[i])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--color-border)] bg-slate-50 font-semibold">
                      <td className="py-2 px-3" colSpan={2}>
                        {effectiveBasis === 'remaining' ? 'Total billed' : 'Total'}
                      </td>
                      <td
                        className={`py-2 px-3 text-right tabular-nums ${
                          milestonesBalanced
                            ? 'text-[var(--color-success)]'
                            : 'text-[var(--color-danger)]'
                        }`}
                      >
                        {effectiveBasis === 'remaining'
                          ? `${milestoneTailPercentTotal}%`
                          : `${milestonePercentTotal}%`}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Terms & Conditions */}
        {tcTemplate && (
          <div className="px-6 py-4 border-t border-[var(--color-border)]">
            <h4 className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">
              Terms & Conditions
              {data.tcOverride && (
                <Badge className="ml-2 bg-amber-100 text-amber-700 hover:bg-amber-100">Customized</Badge>
              )}
            </h4>
            <div
              className="prose prose-sm max-w-none max-h-48 overflow-y-auto"
              dangerouslySetInnerHTML={{
                __html: data.tcOverride || tcTemplate.bodyRichText,
              }}
            />
          </div>
        )}
      </div>

      {/* Internal project expenses summary (never shown to client) */}
      {expensesTotal > 0 && (
        <div className="rounded-[var(--radius-md)] border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Wallet size={15} className="text-[var(--color-muted)]" />
            <h4 className="text-sm font-semibold text-[var(--color-primary)]">
              Project Expenses
            </h4>
            <Badge variant="secondary" className="text-xs">
              Internal only
            </Badge>
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            Declared cost estimates — not shown to the client or on the PDF.
          </p>
          <div className="space-y-1.5">
            {itemsWithExpenses.map((li, idx) => (
              <div key={idx} className="flex justify-between text-sm tabular-nums">
                <span className="text-[var(--color-muted)]">
                  {li.serviceName || li.customName || li.description}
                </span>
                <span>{formatCurrency(lineExpenseTotal(li))}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm font-semibold pt-2 border-t border-slate-200 tabular-nums">
            <span>Total project expenses</span>
            <span>{formatCurrency(expensesTotal)}</span>
          </div>
          <div className="flex justify-between text-sm tabular-nums">
            <span className="text-[var(--color-muted)]">
              Est. gross margin (subtotal − expenses)
            </span>
            <span
              className={
                subtotal - expensesTotal >= 0
                  ? 'text-[var(--color-success)] font-medium'
                  : 'text-[var(--color-danger)] font-medium'
              }
            >
              {formatCurrency(subtotal - expensesTotal)}
            </span>
          </div>
        </div>
      )}

      {/* Validation checklist */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-[var(--color-primary)]">
          Submission Checklist
        </h4>
        <div className="space-y-2">
          {checks.map((check, i) => (
            <div key={i} className="flex items-center gap-2">
              {check.passed ? (
                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                  <Check size={12} className="text-[var(--color-success)]" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                  <X size={12} className="text-[var(--color-danger)]" />
                </div>
              )}
              <span className="text-sm">{check.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Below-floor pricing warning */}
      {hasBelowFloor && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-[var(--radius-sm)] text-amber-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Below-floor pricing detected</p>
            <p className="text-xs mt-0.5">
              One or more line items have rates below the minimum floor. This proposal will be routed to a Sales Manager for approval automatically.
            </p>
          </div>
        </div>
      )}

      {/* Confidential watermark */}
      <div className="flex items-center gap-3">
        <Switch
          id="confidentialWatermark"
          checked={confidentialWatermark}
          onCheckedChange={(checked) => setValue('confidentialWatermark', checked)}
        />
        <Label htmlFor="confidentialWatermark" className="text-sm">
          Add &quot;CONFIDENTIAL&quot; watermark to PDF
        </Label>
      </div>

      {/* Error display */}
      {(submitError || errorMessage) && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-[var(--radius-sm)] text-[var(--color-danger)] text-sm">
          {submitError || errorMessage}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-[var(--color-border)]">
        <Button
          type="button"
          variant="outline"
          onClick={handleSaveDraft}
          disabled={isSaving || isSubmitting}
          className="min-h-[44px]"
        >
          {isSaving ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save as Draft'
          )}
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!allPassed || isSubmitting || isSaving}
          className="min-h-[44px] bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit for Approval'
          )}
        </Button>
      </div>
    </div>
  )
}

// ─── Detail Cell ─────────────────────────────────────────────────────────────

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  )
}
