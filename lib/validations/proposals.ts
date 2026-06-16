import { z } from 'zod'
import { milestonesSumTo100, milestonesPercentTotal } from '../payment-schedule'

// ─── Line item schema ────────────────────────────────────────────────────────

// Per-line-item project expense (internal only — never shown to the client or
// on the PDF). Lenient so blank draft rows don't break auto-save; blank rows are
// pruned server-side before persisting.
export const lineItemExpenseSchema = z.object({
  label: z.string().default(''),
  // .catch(0) keeps a blank number input (NaN) from breaking auto-save/submit
  amount: z.number().min(0, 'Expense amount must be 0 or more').catch(0).default(0),
})

export type LineItemExpense = z.infer<typeof lineItemExpenseSchema>

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
  // Internal project expenses for this line item (not client-facing)
  expenses: z.array(lineItemExpenseSchema).default([]),
  sortOrder: z.number().int().min(0),
  // UI-only fields (not persisted directly)
  serviceName: z.string().default(''),
  serviceMinRate: z.number().nullable().default(null),
})

export type LineItemFormData = z.infer<typeof lineItemSchema>

// ─── Payment milestone schema ────────────────────────────────────────────────

// A single hand-authored payment milestone. Lenient so blank draft rows don't
// break auto-save; the peso amount is derived from `percent` × grand total and
// never stored. Blank rows are pruned by cleanPaymentMilestones before persist.
export const paymentMilestoneSchema = z.object({
  id: z.string().default(''),
  label: z.string().default(''),
  dueDate: z.string().default(''),
  // .catch(0) keeps a blank number input (NaN) from breaking auto-save/submit
  percent: z.number().min(0, 'Percentage must be 0 or more').max(100, 'Percentage cannot exceed 100').catch(0).default(0),
})

export type PaymentMilestoneFormData = z.infer<typeof paymentMilestoneSchema>

/** Drop blank milestone rows and trim; returns the persisted shape (no id). */
export function cleanPaymentMilestones(
  milestones:
    | { label?: string | null; dueDate?: string | null; percent: number }[]
    | undefined
    | null,
): { label: string; dueDate: string; percent: number }[] {
  if (!Array.isArray(milestones)) return []
  return milestones
    .map((m) => ({
      label: (m.label ?? '').trim(),
      dueDate: (m.dueDate ?? '').trim(),
      percent: Number(m.percent) || 0,
    }))
    .filter((m) => m.label !== '' || m.dueDate !== '' || m.percent > 0)
}

/** Drop blank expense rows (no label and zero amount) before persisting. */
export function cleanLineItemExpenses(
  expenses: LineItemExpense[] | undefined | null,
): LineItemExpense[] {
  if (!Array.isArray(expenses)) return []
  return expenses
    .map((e) => ({ label: (e.label ?? '').trim(), amount: Number(e.amount) || 0 }))
    .filter((e) => e.label !== '' || e.amount > 0)
}

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
  businessAddress: z.string().default(''),
  tin: z.string().default(''),
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
  // ₱ per 1 unit of the proposal currency; null when currency is PHP
  exchangeRate: z.number().nullable().default(null),
  discountType: z.enum(['percentage', 'fixed']).nullable().default(null),
  discountValue: z.number().nullable().default(null),
  discountLabel: z.string().default(''),
  vatEnabled: z.boolean().default(true),
  vatRate: z.number().default(12),
  pricingNotes: z.string().default(''),

  // Step 4
  paymentTemplateId: z.string().default(''),
  paymentTermsOverride: z.string().nullable().default(null),
  // null = inherit the selected template's schedule; an array = a per-proposal
  // override (which may be empty to mean "no schedule for this proposal").
  paymentMilestones: z.array(paymentMilestoneSchema).nullable().default(null),

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
    businessAddress: z.string().default(''),
    tin: z.string().default(''),
    brandName: z.string().default(''),
    projectTitle: z.string().min(3, 'Project title is required'),
    date: z.string().min(1, 'Proposal date is required'),
    validUntil: z.string().min(1, 'Valid until date is required'),
    // Resolved server-side from the creator's pre-defined approver
    assignedApproverId: z.string().default(''),
    introText: z.string().default(''),
    lineItems: z.array(lineItemSchema).min(1, 'At least one service is required'),
    currency: z.string().default('PHP'),
    exchangeRate: z.number().nullable().default(null),
    discountType: z.enum(['percentage', 'fixed']).nullable().default(null),
    discountValue: z.number().nullable().default(null),
    discountLabel: z.string().default(''),
    vatEnabled: z.boolean().default(true),
    vatRate: z.number().default(12),
    pricingNotes: z.string().default(''),
    paymentTemplateId: z.string().min(1, 'Payment terms are required'),
    paymentTermsOverride: z.string().nullable().default(null),
    paymentMilestones: z.array(paymentMilestoneSchema).nullable().default(null),
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
  .refine(
    (d) => d.currency === 'PHP' || (d.exchangeRate != null && d.exchangeRate > 0),
    {
      message: 'Exchange rate is required for non-PHP currencies',
      path: ['exchangeRate'],
    },
  )
  .refine(
    (d) => {
      // Milestones are optional, but once any are entered they must cover the
      // whole grand total (100%) — a partial breakdown can't be billed.
      const ms = cleanPaymentMilestones(d.paymentMilestones)
      return ms.length === 0 || milestonesSumTo100(ms)
    },
    {
      message: 'Payment milestones must total 100% of the grand total',
      path: ['paymentMilestones'],
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
  3: ['exchangeRate'],
  4: ['paymentTemplateId', 'paymentMilestones'],
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
    if (
      data.currency !== 'PHP' &&
      (data.exchangeRate == null || data.exchangeRate <= 0)
    ) {
      fieldErrors.exchangeRate = `Exchange rate is required for ${data.currency}`
      messages.push(`Set the ₱ exchange rate for ${data.currency}`)
    }
  }

  if (step === 4) {
    if (!data.paymentTemplateId) {
      fieldErrors.paymentTemplateId = 'Payment terms template is required'
      messages.push('Select a payment terms template')
    }
    const ms = cleanPaymentMilestones(data.paymentMilestones)
    if (ms.length > 0 && !milestonesSumTo100(ms)) {
      fieldErrors.paymentMilestones = `Milestones total ${milestonesPercentTotal(ms)}% — they must add up to 100%`
      messages.push('Payment milestones must total 100% of the grand total')
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
