'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  proposalDraftSchema,
  type ProposalFormData,
} from '@/lib/validations/proposals'
import {
  saveProposalExplicit,
  submitProposalForApproval,
  type ApproverOption,
  type ServiceOption,
  type PaymentTemplateOption,
  type TCTemplateOption,
  type SystemSettingsData,
  type CurrentUserData,
} from '@/lib/actions/proposals'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type WizardContextValue = {
  form: UseFormReturn<ProposalFormData>
  currentStep: number
  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  proposalId: string | null
  proposalNumber: string | null
  saveStatus: SaveStatus
  lastSavedAt: Date | null
  errorMessage: string | null
  saveDraft: () => Promise<void>
  submitForApproval: () => Promise<{ success: boolean; error?: string }>
  // Reference data
  services: ServiceOption[]
  approvers: ApproverOption[]
  paymentTemplates: PaymentTemplateOption[]
  tcTemplates: TCTemplateOption[]
  systemSettings: SystemSettingsData
  currentUser: CurrentUserData
}

const WizardContext = createContext<WizardContextValue | null>(null)

export function useWizard() {
  const ctx = useContext(WizardContext)
  if (!ctx) throw new Error('useWizard must be used within WizardProvider')
  return ctx
}

// ─── Provider ────────────────────────────────────────────────────────────────

type WizardProviderProps = {
  children: ReactNode
  services: ServiceOption[]
  approvers: ApproverOption[]
  paymentTemplates: PaymentTemplateOption[]
  tcTemplates: TCTemplateOption[]
  systemSettings: SystemSettingsData
  currentUser: CurrentUserData
  initialValues?: Partial<ProposalFormData>
  initialProposalId?: string
  initialProposalNumber?: string
}

export function WizardProvider({
  children,
  services,
  approvers,
  paymentTemplates,
  tcTemplates,
  systemSettings,
  currentUser,
  initialValues,
  initialProposalId,
  initialProposalNumber,
}: WizardProviderProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [proposalId, setProposalId] = useState<string | null>(initialProposalId ?? null)
  const [proposalNumber, setProposalNumber] = useState<string | null>(initialProposalNumber ?? null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Track proposal ID in a ref for the auto-save closure
  const proposalIdRef = useRef<string | null>(initialProposalId ?? null)

  const today = new Date().toISOString().split('T')[0]
  const validUntilDefault = new Date(
    Date.now() + systemSettings.defaultValidityDays * 86400000,
  )
    .toISOString()
    .split('T')[0]

  const defaultPayment = paymentTemplates.find((p) => p.isDefault)

  const form = useForm<ProposalFormData>({
    resolver: zodResolver(proposalDraftSchema),
    defaultValues: {
      clientName: '',
      contactName: '',
      contactTitle: '',
      projectTitle: '',
      date: today,
      validUntil: validUntilDefault,
      assignedApproverId: '',
      introText: '',
      lineItems: [],
      currency: systemSettings.defaultCurrency,
      discountType: null,
      discountValue: null,
      discountLabel: '',
      vatEnabled: true,
      vatRate: parseFloat(systemSettings.defaultVatRate),
      pricingNotes: '',
      paymentTemplateId: defaultPayment?.id ?? '',
      paymentTermsOverride: null,
      tcTemplateId: '',
      tcOverride: null,
      confidentialWatermark: false,
      // Merge initial values last (edit mode)
      ...initialValues,
    },
  })

  const setStep = useCallback((step: number) => {
    if (step >= 1 && step <= 6) setCurrentStep(step)
  }, [])

  const nextStep = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, 6))
  }, [])

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 1))
  }, [])

  const saveExplicit = useCallback(async () => {
    setSaveStatus('saving')
    setErrorMessage(null)
    try {
      const values = form.getValues()
      const result = await saveProposalExplicit(proposalIdRef.current, values)
      if ('error' in result) {
        setSaveStatus('error')
        setErrorMessage(result.error)
        return
      }
      if (!proposalIdRef.current) {
        proposalIdRef.current = result.proposalId
        setProposalId(result.proposalId)
        setProposalNumber(result.proposalNumber)
      }
      setSaveStatus('saved')
      setLastSavedAt(new Date())
    } catch {
      setSaveStatus('error')
      setErrorMessage('Failed to save')
    }
  }, [form])

  const handleSubmitForApproval = useCallback(async () => {
    setSaveStatus('saving')
    setErrorMessage(null)
    try {
      const values = form.getValues()
      const result = await submitProposalForApproval(proposalIdRef.current, values)
      if ('error' in result) {
        setSaveStatus('error')
        setErrorMessage(result.error)
        return { success: false, error: result.error }
      }
      if (!proposalIdRef.current) {
        proposalIdRef.current = result.proposalId
        setProposalId(result.proposalId)
        setProposalNumber(result.proposalNumber)
      }
      setSaveStatus('saved')
      setLastSavedAt(new Date())
      return { success: true }
    } catch {
      setSaveStatus('error')
      setErrorMessage('Failed to submit')
      return { success: false, error: 'Failed to submit' }
    }
  }, [form])

  // Expose saveExplicit as the "Save Draft" button action
  // (saveDraft is for auto-save — no version snapshot)
  // We override saveDraft for the explicit save button in Step 6
  const value: WizardContextValue = {
    form,
    currentStep,
    setStep,
    nextStep,
    prevStep,
    proposalId,
    proposalNumber,
    saveStatus,
    lastSavedAt,
    errorMessage,
    saveDraft: saveExplicit,
    submitForApproval: handleSubmitForApproval,
    services,
    approvers,
    paymentTemplates,
    tcTemplates,
    systemSettings,
    currentUser,
  }

  return (
    <WizardContext.Provider value={value}>
      {children}
    </WizardContext.Provider>
  )
}

