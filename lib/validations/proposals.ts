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
  // Step 1
  clientName: z.string().default(''),
  contactName: z.string().default(''),
  contactTitle: z.string().default(''),
  projectTitle: z.string().default(''),
  date: z.string().default(''),
  validUntil: z.string().default(''),
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
    clientName: z.string().min(2, 'Client name is required'),
    contactName: z.string().default(''),
    contactTitle: z.string().default(''),
    projectTitle: z.string().min(3, 'Project title is required'),
    date: z.string().min(1, 'Proposal date is required'),
    validUntil: z.string().min(1, 'Valid until date is required'),
    assignedApproverId: z.string().min(1, 'Approver is required'),
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
