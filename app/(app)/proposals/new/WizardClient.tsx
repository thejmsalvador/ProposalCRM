'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, Check, AlertCircle, ChevronDown, Bookmark, X } from 'lucide-react'
import {
  WizardProvider,
  useWizard,
  type SaveStatus,
} from './WizardContext'
import { useAutoSave } from './useAutoSave'
import { StepIndicator } from './StepIndicator'
import dynamic from 'next/dynamic'
import { Step1ClientDetails } from './steps/Step1ClientDetails'

function StepSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading step">
      <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
      <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />
      <div className="h-10 w-1/2 rounded-lg bg-slate-100 animate-pulse" />
    </div>
  )
}

// Step 1 stays static (first paint); the rest load on demand and are
// prefetched after mount so "Next" never shows the skeleton in practice.
// The react-hook-form instance lives in WizardProvider above this split,
// so lazy-mounting steps doesn't affect form state.
const Step2Services = dynamic(
  () => import('./steps/Step2Services').then((m) => m.Step2Services),
  { ssr: false, loading: () => <StepSkeleton /> },
)
const Step3Pricing = dynamic(
  () => import('./steps/Step3Pricing').then((m) => m.Step3Pricing),
  { ssr: false, loading: () => <StepSkeleton /> },
)
const Step4PaymentTerms = dynamic(
  () => import('./steps/Step4PaymentTerms').then((m) => m.Step4PaymentTerms),
  { ssr: false, loading: () => <StepSkeleton /> },
)
const Step5TermsConditions = dynamic(
  () => import('./steps/Step5TermsConditions').then((m) => m.Step5TermsConditions),
  { ssr: false, loading: () => <StepSkeleton /> },
)
const Step6Review = dynamic(
  () => import('./steps/Step6Review').then((m) => m.Step6Review),
  { ssr: false, loading: () => <StepSkeleton /> },
)
import { Button } from '@/components/ui/button'
import type {
  ApproverOption,
  ServiceOption,
  PaymentTemplateOption,
  TCTemplateOption,
  SystemSettingsData,
  CurrentUserData,
  ProposalFormDataExport,
} from '@/lib/actions/proposals'
import type { ProposalTemplateOption } from '@/lib/actions/templates'

// ─── Public props (from server component) ────────────────────────────────────

type WizardClientProps = {
  services: ServiceOption[]
  approvers: ApproverOption[]
  paymentTemplates: PaymentTemplateOption[]
  tcTemplates: TCTemplateOption[]
  systemSettings: SystemSettingsData
  proposalTemplates?: ProposalTemplateOption[]
  currentUser: CurrentUserData
  initialValues?: Partial<ProposalFormDataExport>
  initialProposalId?: string
  initialProposalNumber?: string
}

export function WizardClient(props: WizardClientProps) {
  return (
    <WizardProvider {...props}>
      <WizardInner proposalTemplates={props.proposalTemplates ?? []} />
    </WizardProvider>
  )
}

// ─── Inner wizard (has access to context) ────────────────────────────────────

function WizardInner({ proposalTemplates }: { proposalTemplates: ProposalTemplateOption[] }) {
  const {
    form,
    currentStep,
    setStep,
    nextStep,
    prevStep,
    stepError,
    proposalId,
    proposalNumber,
    saveStatus: explicitSaveStatus,
    lastSavedAt: explicitLastSaved,
  } = useWizard()

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const handleAutoSaved = useCallback(() => {}, [])

  const { status: autoSaveStatus, lastSavedAt: autoLastSaved } = useAutoSave(
    form,
    proposalId,
    handleAutoSaved,
  )

  // Combine save statuses — explicit save takes priority
  const displayStatus: SaveStatus =
    explicitSaveStatus === 'saving' ? 'saving' : autoSaveStatus === 'saving' ? 'saving' : explicitSaveStatus === 'saved' || autoSaveStatus === 'saved' ? 'saved' : explicitSaveStatus

  const lastSaved = explicitLastSaved ?? autoLastSaved

  // Template picker state
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false)
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null)

  // Warn on navigation away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (form.formState.isDirty) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [form.formState.isDirty])

  // Warm the lazy step chunks after first paint
  useEffect(() => {
    import('./steps/Step2Services')
    import('./steps/Step3Pricing')
    import('./steps/Step4PaymentTerms')
    import('./steps/Step5TermsConditions')
    import('./steps/Step6Review')
  }, [])

  function applyTemplate(template: ProposalTemplateOption) {
    const sp = template.snapshotJson.proposal
    const lineItems = template.snapshotJson.lineItems

    // Reset client-specific fields, keep template fields
    form.reset({
      ...form.getValues(),
      // Reset client fields
      clientId: null,
      clientName: '',
      department: '',
      contactName: '',
      contactTitle: '',
      contactEmail: '',
      contactPhone: '',
      date: new Date().toISOString().split('T')[0],
      // Apply template fields
      brandName: (sp.brandName as string) || '',
      projectTitle: (sp.projectTitle as string) || '',
      introText: (sp.introText as string) || '',
      currency: (sp.currency as string) || 'PHP',
      exchangeRate: sp.exchangeRate != null ? parseFloat(String(sp.exchangeRate)) : null,
      discountType: (sp.discountType === 'percentage' || sp.discountType === 'fixed') ? sp.discountType : null,
      discountValue: sp.discountValue ? parseFloat(sp.discountValue as string) : null,
      vatEnabled: !!(sp.vatRate),
      vatRate: sp.vatRate ? parseFloat(sp.vatRate as string) : 12,
      pricingNotes: (sp.pricingNotes as string) || '',
      paymentTemplateId: (sp.paymentTemplateId as string) || '',
      paymentTermsOverride: (sp.paymentTermsOverride as string | null) || null,
      tcTemplateId: (sp.tcTemplateId as string) || '',
      tcOverride: (sp.tcOverride as string | null) || null,
      confidentialWatermark: !!(sp.confidentialWatermark),
      assignedApproverId: (sp.assignedApproverId as string) || '',
      lineItems: lineItems.map((li, idx) => ({
        id: `tpl-${idx}-${Date.now()}`,
        serviceId: (li.serviceId as string | null) || null,
        customName: (li.customName as string) || '',
        description: (li.description as string) || '',
        scopeOfWork: (li.scopeOfWork as string) || '',
        unit: (li.unit as string) || '',
        quantity: parseFloat((li.quantity as string) || '1'),
        unitRate: parseFloat((li.unitRate as string) || '0'),
        lineTotal: parseFloat((li.lineTotal as string) || '0'),
        isOptional: !!(li.isOptional),
        internalNote: (li.internalNote as string) || '',
        sortOrder: typeof li.sortOrder === 'number' ? li.sortOrder : idx,
        serviceName: '',
        serviceMinRate: null,
      })),
    })
    setAppliedTemplate(template.name)
    setTemplateDropdownOpen(false)
  }

  const personalTemplates = proposalTemplates.filter((t) => !t.isOrgWide)
  const orgTemplates = proposalTemplates.filter((t) => t.isOrgWide)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-primary)]">
            New Proposal
          </h1>
          {proposalNumber && (
            <p className="text-sm text-[var(--color-muted)] font-mono">
              {proposalNumber}
            </p>
          )}
        </div>
        <SaveIndicator status={displayStatus} lastSavedAt={lastSaved} />
      </div>

      {/* Template picker — shown before step 1 content */}
      {proposalTemplates.length > 0 && (
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setTemplateDropdownOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg border border-dashed border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                <Bookmark size={14} />
                Start from template
                <ChevronDown size={14} />
              </button>

              {templateDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                  {orgTemplates.length > 0 && (
                    <>
                      <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Org-wide
                      </p>
                      {orgTemplates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => applyTemplate(t)}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
                        >
                          <Bookmark size={12} className="text-indigo-400 shrink-0" />
                          {t.name}
                        </button>
                      ))}
                    </>
                  )}
                  {personalTemplates.length > 0 && (
                    <>
                      <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        My Templates
                      </p>
                      {personalTemplates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => applyTemplate(t)}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
                        >
                          <Bookmark size={12} className="text-slate-300 shrink-0" />
                          {t.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {appliedTemplate && (
              <div className="flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs text-indigo-700 font-medium">
                <Bookmark size={11} />
                {appliedTemplate}
                <button
                  type="button"
                  onClick={() => setAppliedTemplate(null)}
                  aria-label="Clear template"
                  className="ml-0.5 hover:text-indigo-900"
                >
                  <X size={11} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Close dropdown when clicking outside */}
      {templateDropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setTemplateDropdownOpen(false)}
        />
      )}

      {/* Step indicator */}
      <StepIndicator currentStep={currentStep} onStepClick={setStep} />

      {/* Step content */}
      <div className="min-h-[400px]">
        {currentStep === 1 && <Step1ClientDetails />}
        {currentStep === 2 && <Step2Services />}
        {currentStep === 3 && <Step3Pricing />}
        {currentStep === 4 && <Step4PaymentTerms />}
        {currentStep === 5 && <Step5TermsConditions />}
        {currentStep === 6 && <Step6Review />}
      </div>

      {/* Step validation errors */}
      {stepError && stepError.step === currentStep && (
        <div
          role="alert"
          className="rounded-[var(--radius-sm)] border border-red-200 bg-red-50 px-4 py-3"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-danger)]">
            <AlertCircle size={16} className="shrink-0" />
            Complete this step before continuing
          </div>
          <ul className="mt-1.5 ml-6 list-disc space-y-0.5 text-sm text-red-700">
            {stepError.messages.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Navigation */}
      {currentStep < 6 && (
        <>
          {/* Desktop inline nav */}
          <div className="hidden sm:flex justify-between pt-4 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
              className="min-h-[44px]"
            >
              <ChevronLeft size={16} className="mr-1" />
              Previous
            </Button>
            <Button
              type="button"
              onClick={nextStep}
              className="min-h-[44px] bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90"
            >
              Next
              <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>

          {/* Mobile sticky bottom action bar */}
          <div className="sm:hidden fixed bottom-16 left-0 right-0 z-30 bg-white border-t border-[var(--color-border)] px-4 py-3 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
              className="flex-1 min-h-[44px]"
            >
              <ChevronLeft size={16} className="mr-1" />
              Previous
            </Button>
            <Button
              type="button"
              onClick={nextStep}
              className="flex-1 min-h-[44px] bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90"
            >
              Next
              <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Save status indicator ───────────────────────────────────────────────────

function SaveIndicator({
  status,
  lastSavedAt,
}: {
  status: SaveStatus
  lastSavedAt: Date | null
}) {
  if (status === 'saving') {
    return (
      <div className="flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
        <Clock size={14} className="animate-pulse" />
        Saving...
      </div>
    )
  }

  if (status === 'saved' && lastSavedAt) {
    const now = new Date()
    const diff = now.getTime() - lastSavedAt.getTime()
    const label =
      diff < 10_000
        ? 'Saved just now'
        : diff < 60_000
          ? `Saved ${Math.floor(diff / 1000)}s ago`
          : `Saved ${Math.floor(diff / 60_000)}m ago`

    return (
      <div className="flex items-center gap-1.5 text-sm text-[var(--color-success)]">
        <Check size={14} />
        {label}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-1.5 text-sm text-[var(--color-danger)]">
        <AlertCircle size={14} />
        Save failed
      </div>
    )
  }

  return null
}
