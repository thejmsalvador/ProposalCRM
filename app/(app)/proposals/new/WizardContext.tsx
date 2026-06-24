'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { useForm, type UseFormReturn, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  proposalDraftSchema,
  validateWizardStep,
  WIZARD_STEP_FIELDS,
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

export type StepError = { step: number; messages: string[] }

type WizardContextValue = {
  form: UseFormReturn<ProposalFormData>
  currentStep: number
  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  stepError: StepError | null
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
    // Cast: the schema's .default() makes zod's input type looser than its
    // output, but the form always supplies complete defaultValues
    resolver: zodResolver(proposalDraftSchema) as Resolver<ProposalFormData>,
    defaultValues: {
      clientId: null,
      clientName: '',
      department: '',
      contactName: '',
      contactTitle: '',
      contactEmail: '',
      contactPhone: '',
      businessAddress: '',
      tin: '',
      brandName: '',
      projectTitle: '',
      date: today,
      validUntil: validUntilDefault,
      assignedApproverId: '',
      introText: '',
      lineItems: [],
      currency: systemSettings.defaultCurrency,
      exchangeRate: null,
      discountType: null,
      discountValue: null,
      discountLabel: '',
      vatEnabled: true,
      vatRate: parseFloat(systemSettings.defaultVatRate),
      pricingNotes: '',
      paymentTemplateId: defaultPayment?.id ?? '',
      paymentTermsOverride: null,
      paymentMilestones: null,
      milestoneBasis: null,
      tcTemplateId: '',
      tcOverride: null,
      tcSections: [],
      confidentialWatermark: false,
      // Merge initial values last (edit mode)
      ...initialValues,
    },
  })

  const [stepError, setStepError] = useState<StepError | null>(null)

  // Validates one step's required fields; surfaces inline field errors and
  // returns whether the step is complete.
  const validateStep = useCallback(
    (step: number): boolean => {
      const fields = WIZARD_STEP_FIELDS[step]
      if (fields?.length) form.clearErrors(fields)

      const result = validateWizardStep(step, form.getValues())
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        form.setError(field as keyof ProposalFormData, { type: 'manual', message })
      }
      if (!result.valid) setStepError({ step, messages: result.messages })
      return result.valid
    },
    [form],
  )

  // Moving backward is always allowed; moving forward requires every step
  // between the current one and the target to pass validation. On failure,
  // the user lands on the first incomplete step with its errors shown.
  const setStep = useCallback(
    (target: number) => {
      if (target < 1 || target > 6) return
      if (target <= currentStep) {
        setStepError(null)
        setCurrentStep(target)
        return
      }
      for (let step = currentStep; step < target; step++) {
        if (!validateStep(step)) {
          setCurrentStep(step)
          return
        }
      }
      setStepError(null)
      setCurrentStep(target)
    },
    [currentStep, validateStep],
  )

  const nextStep = useCallback(() => {
    setStep(currentStep + 1)
  }, [setStep, currentStep])

  const prevStep = useCallback(() => {
    setStep(currentStep - 1)
  }, [setStep, currentStep])

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
    stepError,
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

