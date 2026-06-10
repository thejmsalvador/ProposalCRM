import { z } from 'zod'

// ─── Line item schema ────────────────────────────────────────────────────────

export const lineItemSchema = z.object({
  id: z.string(), // client-side temp ID
  serviceId: z.string().nullable(),
  customName: z.string().default(''),
  description: z.string().min(1, 'Description is required'),
  scopeOfWork: z.string().default(''),
  unit: z.string().min(1, 'Unit is required'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unitRate: z.number().min(0, 'Rate must be 0 or more'),
  lineTotal: z.number().min(0),
  isOptional: z.boolean().default(false),
  internalNote: z.string().default(''),
  sortOrder: z.number().int().min(0),
  // UI-only fields (not persisted directly)
  serviceName: z.string().default(''),
  serviceMinRate: z.number().nullable().default(null),
})

export type LineItemFormData = z.infer<typeof lineItemSchema>

// ─── Draft save schema (relaxed — allows partial data) ──────────────────────

export const proposalDraftSchema = z.object({
  // Step 1 — Client Details
  clientId: z.string().nullable().default(null),
  clientName: z.string().default(''),
  department: z.string().default(''),
  contactName: z.string().default(''),
  contactTitle: z.string().default(''),
  contactEmail: z.string().default(''),
  contactPhone: z.string().default(''),
  // Step 1 — Project Details
  brandName: z.string().default(''),
  projectTitle: z.string().default(''),
  date: z.string().default(''),
  validUntil: z.string().default(''),
  // Approver is resolved server-side on submit (creator's default approver /
  // team manager) — no longer picked in the wizard.
  assignedApproverId: z.string().default(''),
  introText: z.string().default(''),

  // Step 2
  lineItems: z.array(lineItemSchema).default([]),

  // Step 3
  currency: z.string().default('PHP'),
  discountType: z.enum(['percentage', 'fixed']).nullable().default(null),
  discountValue: z.number().nullable().default(null),
  discountLabel: z.string().default(''),
  vatEnabled: z.boolean().default(true),
  vatRate: z.number().default(12),
  pricingNotes: z.string().default(''),

  // Step 4
  paymentTemplateId: z.string().default(''),
  paymentTermsOverride: z.string().nullable().default(null),

  // Step 5
  tcTemplateId: z.string().default(''),
  tcOverride: z.string().nullable().default(null),

  // Step 6
  confidentialWatermark: z.boolean().default(false),
})

export type ProposalFormData = z.infer<typeof proposalDraftSchema>

// ─── Submission schema (strict — all required fields enforced) ───────────────

export const proposalSubmitSchema = z
  .object({
    clientName: z.string().min(2, 'Company name is required'),
    department: z.string().default(''),
    contactName: z.string().default(''),
    contactTitle: z.string().default(''),
    contactEmail: z
      .string()
      .email('Invalid email address')
      .or(z.literal(''))
      .default(''),
    contactPhone: z.string().default(''),
    brandName: z.string().default(''),
    projectTitle: z.string().min(3, 'Project title is required'),
    date: z.string().min(1, 'Proposal date is required'),
    validUntil: z.string().min(1, 'Valid until date is required'),
    // Resolved server-side from the creator's pre-defined approver
    assignedApproverId: z.string().default(''),
    introText: z.string().default(''),
    lineItems: z.array(lineItemSchema).min(1, 'At least one service is required'),
    currency: z.string().default('PHP'),
    discountType: z.enum(['percentage', 'fixed']).nullable().default(null),
    discountValue: z.number().nullable().default(null),
    discountLabel: z.string().default(''),
    vatEnabled: z.boolean().default(true),
    vatRate: z.number().default(12),
    pricingNotes: z.string().default(''),
    paymentTemplateId: z.string().min(1, 'Payment terms are required'),
    paymentTermsOverride: z.string().nullable().default(null),
    tcTemplateId: z.string().min(1, 'Terms & conditions are required'),
    tcOverride: z.string().nullable().default(null),
    confidentialWatermark: z.boolean().default(false),
  })
  .refine(
    (d) => {
      if (!d.date || !d.validUntil) return true
      return new Date(d.validUntil) > new Date(d.date)
    },
    {
      message: 'Valid until must be after proposal date',
      path: ['validUntil'],
    },
  )
  .refine(
    (d) => {
      const total = computeTotal(d)
      return total > 0
    },
    {
      message: 'Total must be greater than 0',
      path: ['lineItems'],
    },
  )

// ─── Per-step wizard validation ──────────────────────────────────────────────
// Gates forward navigation in the proposal wizard: each step's required fields
// must be filled before the user can advance past it.

export type StepValidationResult = {
  valid: boolean
  /** Errors tied to a specific form field — surfaced inline via form.setError */
  fieldErrors: Partial<Record<keyof ProposalFormData, string>>
  /** All error messages for the step — shown in the step error summary */
  messages: string[]
}

/** Fields owned by each step, used to clear stale manual errors before re-validating */
export const WIZARD_STEP_FIELDS: Record<number, (keyof ProposalFormData)[]> = {
  1: ['clientName', 'contactEmail', 'projectTitle', 'date', 'validUntil'],
  2: ['lineItems'],
  3: [],
  4: ['paymentTemplateId'],
  5: ['tcTemplateId'],
  6: [],
}

export function validateWizardStep(
  step: number,
  data: ProposalFormData,
): StepValidationResult {
  const fieldErrors: StepValidationResult['fieldErrors'] = {}
  const messages: string[] = []

  if (step === 1) {
    if (!data.clientName || data.clientName.trim().length < 2) {
      fieldErrors.clientName = 'Company name is required'
    }
    if (
      data.contactEmail &&
      !z.string().email().safeParse(data.contactEmail).success
    ) {
      fieldErrors.contactEmail = 'Invalid email address'
    }
    if (!data.projectTitle || data.projectTitle.trim().length < 3) {
      fieldErrors.projectTitle = 'Project title is required'
    }
    if (!data.date) {
      fieldErrors.date = 'Proposal date is required'
    }
    if (!data.validUntil) {
      fieldErrors.validUntil = 'Valid until date is required'
    } else if (data.date && new Date(data.validUntil) <= new Date(data.date)) {
      fieldErrors.validUntil = 'Valid until must be after proposal date'
    }
    messages.push(...Object.values(fieldErrors))
  }

  if (step === 2) {
    if (data.lineItems.length === 0) {
      messages.push('Add at least one service line item')
    } else {
      data.lineItems.forEach((li, idx) => {
        const name =
          li.customName || li.serviceName || li.description || `Line item ${idx + 1}`
        if (!li.description.trim()) messages.push(`${name}: description is required`)
        if (!li.unit.trim()) messages.push(`${name}: unit is required`)
        if (li.quantity <= 0) messages.push(`${name}: quantity must be greater than 0`)
        if (li.unitRate < 0) messages.push(`${name}: rate must be 0 or more`)
      })
    }
  }

  if (step === 3) {
    if (computeTotal(data) <= 0) {
      messages.push('Total must be greater than 0 — check line items and discount')
    }
  }

  if (step === 4) {
    if (!data.paymentTemplateId) {
      fieldErrors.paymentTemplateId = 'Payment terms template is required'
      messages.push('Select a payment terms template')
    }
  }

  if (step === 5) {
    if (!data.tcTemplateId) {
      fieldErrors.tcTemplateId = 'Terms & conditions template is required'
      messages.push('Select a terms & conditions template')
    }
  }

  return { valid: messages.length === 0, fieldErrors, messages }
}

// ─── Pricing helpers ─────────────────────────────────────────────────────────

export function computeSubtotal(
  lineItems: { lineTotal: number; isOptional: boolean }[],
): number {
  return lineItems
    .filter((li) => !li.isOptional)
    .reduce((sum, li) => sum + li.lineTotal, 0)
}

export function computeDiscount(
  subtotal: number,
  discountType: 'percentage' | 'fixed' | null,
  discountValue: number | null,
): number {
  if (!discountType || !discountValue || discountValue <= 0) return 0
  if (discountType === 'percentage') {
    return subtotal * (discountValue / 100)
  }
  return discountValue
}

export function computeTotal(data: {
  lineItems: { lineTotal: number; isOptional: boolean }[]
  discountType: 'percentage' | 'fixed' | null
  discountValue: number | null
  vatEnabled: boolean
  vatRate: number
}): number {
  const subtotal = computeSubtotal(data.lineItems)
  const discount = computeDiscount(subtotal, data.discountType, data.discountValue)
  const afterDiscount = subtotal - discount
  const vat = data.vatEnabled ? afterDiscount * (data.vatRate / 100) : 0
  return afterDiscount + vat
}

// ─── Currency formatter ──────────────────────────────────────────────────────

export function formatCurrency(amount: number, currency = 'PHP'): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
