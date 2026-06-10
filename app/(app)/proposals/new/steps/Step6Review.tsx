'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2, AlertTriangle } from 'lucide-react'
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
} from '@/lib/validations/proposals'

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

  // Validation checklist
  const checks: CheckItem[] = [
    { label: 'Client name provided', passed: data.clientName.length >= 2 },
    { label: 'Project title provided', passed: data.projectTitle.length >= 3 },
    { label: 'At least one service line item', passed: data.lineItems.length > 0 },
    { label: 'Total greater than 0', passed: total > 0 },
    { label: 'Payment terms selected', passed: !!data.paymentTemplateId },
    { label: 'Terms & conditions selected', passed: !!data.tcTemplateId },
  ]
  const allPassed = checks.every((c) => c.passed)

  // Below-floor pricing check
  const hasBelowFloor = data.lineItems.some(
    (li) => li.serviceMinRate != null && li.unitRate < li.serviceMinRate,
  )

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
                    <th className="text-right py-2 px-2 font-medium text-[var(--color-muted)]">Qty</th>
                    <th className="text-right py-2 px-2 font-medium text-[var(--color-muted)]">Unit</th>
                    <th className="text-right py-2 px-2 font-medium text-[var(--color-muted)]">Rate</th>
                    <th className="text-right py-2 pl-2 font-medium text-[var(--color-muted)]">Total</th>
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
                      <td className="text-right py-2 px-2">{li.quantity}</td>
                      <td className="text-right py-2 px-2">{li.unit}</td>
                      <td className="text-right py-2 px-2">{formatCurrency(li.unitRate, data.currency)}</td>
                      <td className="text-right py-2 pl-2 font-medium">{formatCurrency(li.lineTotal, data.currency)}</td>
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
            <span className="font-medium">{formatCurrency(subtotal, data.currency)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-[var(--color-danger)]">
              <span>{data.discountLabel || 'Discount'}</span>
              <span>-{formatCurrency(discount, data.currency)}</span>
            </div>
          )}
          {data.vatEnabled && (
            <div className="flex justify-between text-sm">
              <span>VAT ({data.vatRate}%)</span>
              <span>{formatCurrency((subtotal - discount) * (data.vatRate / 100), data.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold pt-2 border-t border-[var(--color-border)]">
            <span>Total</span>
            <span className="text-[var(--color-accent)]">{formatCurrency(total, data.currency)}</span>
          </div>
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
