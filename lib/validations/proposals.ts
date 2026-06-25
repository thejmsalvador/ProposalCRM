import { z } from 'zod'
import {
  milestonesPercentTotal,
  milestonesValidForBasis,
  remainingTailPercentTotal,
  normalizeBasis,
} from '../payment-schedule'

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

// ─── T&C section schema ──────────────────────────────────────────────────────

// One selected T&C section on a proposal. `override` is null to inherit the
// section's library body, or a string for a per-proposal customization. Order in
// the array is the order sections are compiled into the PDF.
export const tcSectionSchema = z.object({
  tcTemplateId: z.string().default(''),
  override: z.string().nullable().default(null),
})

export type TcSectionFormData = z.infer<typeof tcSectionSchema>

/** Drop entries without a section reference before persisting. */
export function cleanTcSections(
  sections: { tcTemplateId?: string | null; override?: string | null }[] | undefined | null,
): { tcTemplateId: string; override: string | null }[] {
  if (!Array.isArray(sections)) return []
  return sections
    .filter((s) => !!(s.tcTemplateId ?? '').trim())
    .map((s) => ({
      tcTemplateId: (s.tcTemplateId ?? '').trim(),
      override: s.override ?? null,
    }))
}

/** Parse a stored `tcSections` JSON value back into the form/array shape. */
export function parseTcSections(raw: unknown): { tcTemplateId: string; override: string | null }[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((s) => {
    if (s && typeof s === 'object' && 'tcTemplateId' in s) {
      const o = s as Record<string, unknown>
      const id = String(o.tcTemplateId ?? '').trim()
      if (!id) return []
      return [{ tcTemplateId: id, override: o.override == null ? null : String(o.override) }]
    }
    return []
  })
}

// ─── Mode of Payment selection schema ────────────────────────────────────────

// One selected Mode of Payment (company bank account) on a proposal. Only the
// library reference is stored — bank details are company-wide facts resolved at
// render time, never retyped per proposal. Order in the array is the order
// accounts are listed on the detail page and PDF.
export const modeOfPaymentSelectionSchema = z.object({
  modeOfPaymentId: z.string().default(''),
})

export type ModeOfPaymentSelectionFormData = z.infer<typeof modeOfPaymentSelectionSchema>

/** Drop entries without a reference and de-duplicate, preserving order. */
export function cleanModesOfPayment(
  modes: { modeOfPaymentId?: string | null }[] | undefined | null,
): { modeOfPaymentId: string }[] {
  if (!Array.isArray(modes)) return []
  const seen = new Set<string>()
  const out: { modeOfPaymentId: string }[] = []
  for (const m of modes) {
    const id = (m.modeOfPaymentId ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ modeOfPaymentId: id })
  }
  return out
}

/** Parse a stored `modesOfPayment` JSON value back into the form/array shape. */
export function parseModesOfPayment(raw: unknown): { modeOfPaymentId: string }[] {
  if (!Array.isArray(raw)) return []
  return cleanModesOfPayment(
    raw.flatMap((m) => {
      if (m && typeof m === 'object' && 'modeOfPaymentId' in m) {
        const o = m as Record<string, unknown>
        return [{ modeOfPaymentId: String(o.modeOfPaymentId ?? '').trim() }]
      }
      // Tolerate a bare string[] shape too.
      if (typeof m === 'string') return [{ modeOfPaymentId: m.trim() }]
      return []
    }),
  )
}

// ─── Signatory schema ────────────────────────────────────────────────────────

// One client-side signatory shown in the proposal's "Conforme" block. The client
// signs the printed PDF by hand, so no signature image is captured here — only the
// printed identity (name, position, company). Lenient defaults keep blank draft
// rows from breaking auto-save; entirely-blank rows are pruned by cleanSignatories
// before persisting, and a row only counts toward the "at least one signatory"
// submit requirement once all three fields are filled (isCompleteSignatory).
export const signatorySchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  position: z.string().default(''),
  companyName: z.string().default(''),
})

export type SignatoryFormData = z.infer<typeof signatorySchema>

export type Signatory = { name: string; position: string; companyName: string }

/** Drop entirely-blank rows; keep partially-filled ones so drafts persist work. */
export function cleanSignatories(
  signatories:
    | { name?: string | null; position?: string | null; companyName?: string | null }[]
    | undefined
    | null,
): Signatory[] {
  if (!Array.isArray(signatories)) return []
  return signatories
    .map((s) => ({
      name: (s.name ?? '').trim(),
      position: (s.position ?? '').trim(),
      companyName: (s.companyName ?? '').trim(),
    }))
    .filter((s) => s.name !== '' || s.position !== '' || s.companyName !== '')
}

/** A signatory is complete (renderable / counts toward submit) when all fields are set. */
export function isCompleteSignatory(s: Signatory): boolean {
  return s.name !== '' && s.position !== '' && s.companyName !== ''
}

/** Parse a stored `signatories` JSON value back into the form/array shape. */
export function parseSignatories(raw: unknown): Signatory[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((s) => {
    if (s && typeof s === 'object') {
      const o = s as Record<string, unknown>
      const name = String(o.name ?? '').trim()
      const position = String(o.position ?? '').trim()
      const companyName = String(o.companyName ?? '').trim()
      if (!name && !position && !companyName) return []
      return [{ name, position, companyName }]
    }
    return []
  })
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
  // Short internal account code for the client (e.g. "SUNB"). Optional.
  accountCode: z.string().default(''),
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
  // null = inherit the template's calculation basis; otherwise this proposal's own.
  milestoneBasis: z.enum(['total', 'remaining']).nullable().default(null),
  // Ordered multi-select of company bank accounts ("Mode of Payment") shown on the PDF.
  modesOfPayment: z.array(modeOfPaymentSelectionSchema).default([]),

  // Step 5
  // Legacy single-template fields, kept for back-compat with older drafts.
  tcTemplateId: z.string().default(''),
  tcOverride: z.string().nullable().default(null),
  // Ordered multi-select of T&C sections compiled into the PDF.
  tcSections: z.array(tcSectionSchema).default([]),

  // Step 6 — Signatories (client-side "Conforme" signers; signed off-platform)
  signatories: z.array(signatorySchema).default([]),

  // Step 7 — Review
  confidentialWatermark: z.boolean().default(false),
})

export type ProposalFormData = z.infer<typeof proposalDraftSchema>

// ─── Submission schema (strict — all required fields enforced) ───────────────

export const proposalSubmitSchema = z
  .object({
    clientName: z.string().min(2, 'Company name is required'),
    accountCode: z.string().default(''),
    department: z.string().default(''),
    contactName: z.string().min(1, 'Contact person is required'),
    contactTitle: z.string().min(1, 'Position is required'),
    contactEmail: z
      .string()
      .min(1, 'Email address is required')
      .email('Invalid email address'),
    contactPhone: z.string().min(1, 'Contact number is required'),
    businessAddress: z.string().default(''),
    tin: z.string().default(''),
    brandName: z.string().default(''),
    projectTitle: z.string().min(3, 'Project title is required'),
    date: z.string().min(1, 'Proposal date is required'),
    validUntil: z.string().min(1, 'Valid until date is required'),
    // Resolved server-side from the creator's pre-defined approver
    assignedApproverId: z.string().default(''),
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
    milestoneBasis: z.enum(['total', 'remaining']).nullable().default(null),
    modesOfPayment: z
      .array(modeOfPaymentSelectionSchema)
      .min(1, 'At least one mode of payment is required'),
    tcTemplateId: z.string().default(''),
    tcOverride: z.string().nullable().default(null),
    tcSections: z
      .array(tcSectionSchema)
      .min(1, 'At least one T&C section is required'),
    signatories: z.array(signatorySchema).default([]),
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
      // Milestones are optional, but once any are entered they must fully bill the
      // grand total under the selected calculation basis.
      const ms = cleanPaymentMilestones(d.paymentMilestones)
      return milestonesValidForBasis(ms, normalizeBasis(d.milestoneBasis))
    },
    {
      message: 'Payment milestones must fully bill the grand total',
      path: ['paymentMilestones'],
    },
  )
  .refine((d) => cleanSignatories(d.signatories).some(isCompleteSignatory), {
    message: 'At least one signatory (name, position, and company) is required',
    path: ['signatories'],
  })

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
  1: [
    'clientName',
    'contactName',
    'contactTitle',
    'contactEmail',
    'contactPhone',
    'projectTitle',
    'date',
    'validUntil',
  ],
  2: ['lineItems'],
  3: ['exchangeRate'],
  4: ['paymentTemplateId', 'paymentMilestones', 'milestoneBasis', 'modesOfPayment'],
  5: ['tcSections'],
  6: ['signatories'],
  7: [],
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
    if (!data.contactName || !data.contactName.trim()) {
      fieldErrors.contactName = 'Contact person is required'
    }
    if (!data.contactTitle || !data.contactTitle.trim()) {
      fieldErrors.contactTitle = 'Position is required'
    }
    if (!data.contactEmail || !data.contactEmail.trim()) {
      fieldErrors.contactEmail = 'Email address is required'
    } else if (!z.string().email().safeParse(data.contactEmail).success) {
      fieldErrors.contactEmail = 'Invalid email address'
    }
    if (!data.contactPhone || !data.contactPhone.trim()) {
      fieldErrors.contactPhone = 'Contact number is required'
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
    const basis = normalizeBasis(data.milestoneBasis)
    if (ms.length > 0 && !milestonesValidForBasis(ms, basis)) {
      if (basis === 'remaining') {
        fieldErrors.paymentMilestones = `Succeeding milestones total ${remainingTailPercentTotal(
          ms,
        )}% — they must add up to 100% of the remaining balance`
        messages.push('Succeeding milestones must total 100% of the remaining balance')
      } else {
        fieldErrors.paymentMilestones = `Milestones total ${milestonesPercentTotal(
          ms,
        )}% — they must add up to 100%`
        messages.push('Payment milestones must total 100% of the grand total')
      }
    }
    if (cleanModesOfPayment(data.modesOfPayment).length === 0) {
      fieldErrors.modesOfPayment = 'At least one mode of payment is required'
      messages.push('Select at least one mode of payment')
    }
  }

  if (step === 5) {
    if (cleanTcSections(data.tcSections).length === 0) {
      fieldErrors.tcSections = 'At least one T&C section is required'
      messages.push('Select at least one terms & conditions section')
    }
  }

  if (step === 6) {
    const complete = cleanSignatories(data.signatories).filter(isCompleteSignatory)
    if (complete.length === 0) {
      fieldErrors.signatories = 'At least one signatory is required'
      messages.push('Add at least one signatory with a name, position, and company')
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
