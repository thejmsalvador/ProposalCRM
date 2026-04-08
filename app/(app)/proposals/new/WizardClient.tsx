'use client'

import { useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Clock, Check, AlertCircle } from 'lucide-react'
import {
  WizardProvider,
  useWizard,
  type SaveStatus,
} from './WizardContext'
import { useAutoSave } from './useAutoSave'
import { StepIndicator } from './StepIndicator'
import { Step1ClientDetails } from './steps/Step1ClientDetails'
import { Step2Services } from './steps/Step2Services'
import { Step3Pricing } from './steps/Step3Pricing'
import { Step4PaymentTerms } from './steps/Step4PaymentTerms'
import { Step5TermsConditions } from './steps/Step5TermsConditions'
import { Step6Review } from './steps/Step6Review'
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

// ─── Public props (from server component) ────────────────────────────────────

type WizardClientProps = {
  services: ServiceOption[]
  approvers: ApproverOption[]
  paymentTemplates: PaymentTemplateOption[]
  tcTemplates: TCTemplateOption[]
  systemSettings: SystemSettingsData
  currentUser: CurrentUserData
  initialValues?: Partial<ProposalFormDataExport>
  initialProposalId?: string
  initialProposalNumber?: string
}

export function WizardClient(props: WizardClientProps) {
  return (
    <WizardProvider {...props}>
      <WizardInner />
    </WizardProvider>
  )
}

// ─── Inner wizard (has access to context) ────────────────────────────────────

function WizardInner() {
  const {
    form,
    currentStep,
    setStep,
    nextStep,
    prevStep,
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

      {/* Navigation */}
      {currentStep < 6 && (
        <div className="flex justify-between pt-4 border-t border-[var(--color-border)]">
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
