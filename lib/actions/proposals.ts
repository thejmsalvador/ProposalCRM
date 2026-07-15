'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '../generated/prisma/client'
import { getSession } from '../auth'
import { can } from '../permissions'
import { prisma } from '../prisma'
import { logAudit } from '../audit'
import { canViewProposal, canEditProposal } from '../proposal-visibility'
import {
  activityInclude,
  serializeActivity,
  type ProposalActivityItem,
} from '../activity-shared'
import { DEFAULT_AGENCY_NAME } from '../branding'
import { createNotification } from '../notifications'
import {
  sendEmail,
  approvalRequestEmail,
  proposalApprovedEmail,
  revisionRequestedEmail,
} from '../email'
import { syncClientFromProposal } from './clients'
import {
  proposalDraftSchema,
  proposalSubmitSchema,
  computeSubtotal,
  computeTotal,
  cleanLineItemExpenses,
  cleanPaymentMilestones,
  cleanTcSections,
  parseTcSections,
  cleanModesOfPayment,
  parseModesOfPayment,
  cleanSignatories,
  parseSignatories,
  isCompleteSignatory,
  type ProposalFormData,
  type TcSectionFormData,
  type ModeOfPaymentSelectionFormData,
  type Signatory,
  type SignatoryFormData,
  type LineItemExpense,
} from '../validations/proposals'
import {
  parsePaymentMilestones,
  milestonesValidForBasis,
  normalizeBasis,
  type MilestoneBasis,
} from '../payment-schedule'
import { resolveTcSections } from '../tc-sections'
import { resolveModesOfPayment, type ResolvedModeOfPayment } from '../mode-of-payment-sections'

// ─── Serialisable types ──────────────────────────────────────────────────────

export type ApproverOption = {
  id: string
  name: string
  role: string
}

export type ServiceOption = {
  id: string
  name: string
  category: string
  description: string
  defaultScope: string
  unit: string
  engagementTerm: number
  defaultRate: string
  minRate: string | null
  maxRate: string | null
  // Internal estimated project expenses — seeds the line item's expenses when
  // the service is added to a proposal. Never client-facing.
  estimatedExpenses: LineItemExpense[]
}

/** Parse a stored Json expenses value into a typed {label, amount}[] array. */
function parseLineItemExpenses(raw: unknown): LineItemExpense[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((e) => {
    if (e && typeof e === 'object' && 'label' in e && 'amount' in e) {
      const item = e as { label: unknown; amount: unknown }
      return [{ label: String(item.label), amount: Number(item.amount) || 0 }]
    }
    return []
  })
}

export type PaymentTemplateOption = {
  id: string
  name: string
  bodyRichText: string
  milestones: { label: string; dueDate: string; percent: number }[]
  milestoneBasis: MilestoneBasis
  isDefault: boolean
}

export type TCTemplateOption = {
  id: string
  name: string
  bodyRichText: string
  categories: string[]
}

export type ModeOfPaymentOption = {
  id: string
  label: string
  bankName: string
  accountName: string
  accountNumber: string
  branch: string
  swiftCode: string
}

export type SystemSettingsData = {
  defaultValidityDays: number
  defaultCurrency: string
  defaultVatRate: string
  agencyName: string
}

export type CurrentUserData = {
  id: string
  name: string
  email: string
  role: string
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getWizardData(): Promise<{
  services: ServiceOption[]
  paymentTemplates: PaymentTemplateOption[]
  tcTemplates: TCTemplateOption[]
  modesOfPayment: ModeOfPaymentOption[]
  systemSettings: SystemSettingsData
}> {
  const [services, paymentTemplates, tcTemplates, modesOfPayment, settings] =
    await Promise.all([
      prisma.service.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          category: true,
          description: true,
          defaultScope: true,
          unit: true,
          engagementTerm: true,
          defaultRate: true,
          minRate: true,
          maxRate: true,
          estimatedExpenses: true,
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      prisma.paymentTemplate.findMany({
        where: { isArchived: false },
        select: {
          id: true,
          name: true,
          bodyRichText: true,
          milestones: true,
          milestoneBasis: true,
          isDefault: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.tCTemplate.findMany({
        where: { isArchived: false },
        select: { id: true, name: true, bodyRichText: true, categories: true },
        orderBy: { name: 'asc' },
      }),
      prisma.modeOfPayment.findMany({
        where: { isArchived: false },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      }),
      prisma.systemSettings.findFirst(),
    ])

  return {
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
      defaultScope: s.defaultScope,
      unit: s.unit,
      engagementTerm: s.engagementTerm,
      defaultRate: String(s.defaultRate),
      minRate: s.minRate != null ? String(s.minRate) : null,
      maxRate: s.maxRate != null ? String(s.maxRate) : null,
      estimatedExpenses: parseLineItemExpenses(s.estimatedExpenses),
    })),
    paymentTemplates: paymentTemplates.map((p) => ({
      id: p.id,
      name: p.name,
      bodyRichText: p.bodyRichText,
      milestones: parsePaymentMilestones(p.milestones),
      milestoneBasis: normalizeBasis(p.milestoneBasis),
      isDefault: p.isDefault,
    })),
    tcTemplates: tcTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      bodyRichText: t.bodyRichText,
      categories: t.categories,
    })),
    modesOfPayment: modesOfPayment.map((m) => ({
      id: m.id,
      label: m.label,
      bankName: m.bankName,
      accountName: m.accountName,
      accountNumber: m.accountNumber,
      branch: m.branch ?? '',
      swiftCode: m.swiftCode ?? '',
    })),
    systemSettings: {
      defaultValidityDays: settings?.defaultValidityDays ?? 30,
      defaultCurrency: settings?.defaultCurrency ?? 'PHP',
      defaultVatRate: String(settings?.defaultVatRate ?? 12),
      agencyName: settings?.agencyName ?? DEFAULT_AGENCY_NAME,
    },
  }
}

// ─── Proposal number generation ──────────────────────────────────────────────

async function generateProposalNumber(): Promise<string> {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  // "CE" = Cost Estimate, the company's term for these documents. The sequential
  // NNNN still lands at split('-')[3] because "CE" has no internal hyphen.
  const prefix = `CE-${yyyy}-${mm}-`

  const latest = await prisma.proposal.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
  })

  const next = latest ? parseInt(latest.number.split('-')[3]) + 1 : 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

/**
 * Create a Proposal, allocating its unique number with retry. generateProposalNumber
 * is a non-atomic findFirst→+1, so two concurrent creates in the same month can
 * compute the same NNNN and one insert would hit the @unique constraint (P2002).
 * On that collision we regenerate the number and retry, so neither create 500s.
 */
async function createProposalWithUniqueNumber(
  data: Omit<Prisma.ProposalUncheckedCreateInput, 'number'>,
) {
  const MAX_ATTEMPTS = 5
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const number = await generateProposalNumber()
    try {
      return await prisma.proposal.create({ data: { ...data, number } })
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        attempt < MAX_ATTEMPTS - 1
      ) {
        continue // number collided with a concurrent create — regenerate and retry
      }
      throw e
    }
  }
  throw new Error('Could not allocate a unique proposal number')
}

// ─── Approver resolution ─────────────────────────────────────────────────────
// ─── Two-stage approval routing (COO reviews first, then CEO) ─────────────────
//
// Every submission by a non-SUPER_ADMIN routes to the COO first; once the COO
// approves it advances to the CEO. The proposal is only fully APPROVED (and PDF
// generation unlocked) after the CEO signs off.

async function resolveCOO(): Promise<string | null> {
  const coo = await prisma.user.findFirst({
    where: { role: 'COO', isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  return coo?.id ?? null
}

async function resolveCEO(): Promise<string | null> {
  const ceo = await prisma.user.findFirst({
    where: { role: 'CEO', isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  return ceo?.id ?? null
}

// ─── Save draft ──────────────────────────────────────────────────────────────

export async function saveProposalDraft(
  proposalId: string | null,
  raw: ProposalFormData,
): Promise<
  { success: true; proposalId: string; proposalNumber: string } | { error: string }
> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'create:proposal')) return { error: 'Unauthorized' }

  const parsed = proposalDraftSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const data = parsed.data

  const subtotal = computeSubtotal(data.lineItems)
  const total = computeTotal(data)

  // Check if any line item is below floor pricing
  const hasBelowFloorPricing = data.lineItems.some(
    (li) => li.serviceMinRate != null && li.unitRate < li.serviceMinRate,
  )

  const proposalData = {
    clientId: data.clientId || null,
    clientName: data.clientName || 'Untitled',
    accountCode: data.accountCode.trim().toUpperCase() || null,
    contactName: data.contactName || null,
    contactTitle: data.contactTitle || null,
    department: data.department || null,
    contactEmail: data.contactEmail || null,
    contactPhone: data.contactPhone || null,
    businessAddress: data.businessAddress || null,
    tin: data.tin || null,
    brandName: data.brandName || null,
    projectTitle: data.projectTitle || 'Untitled Project',
    date: data.date ? new Date(data.date) : new Date(),
    validUntil: data.validUntil ? new Date(data.validUntil) : new Date(),
    assignedApproverId: data.assignedApproverId || null,
    currency: data.currency,
    exchangeRate: data.currency === 'PHP' ? null : data.exchangeRate ?? null,
    subtotal,
    discountType: data.discountType,
    discountValue: data.discountValue,
    vatRate: data.vatEnabled ? data.vatRate : null,
    total,
    pricingNotes: data.pricingNotes || null,
    paymentTemplateId: data.paymentTemplateId || null,
    paymentTermsOverride: data.paymentTermsOverride,
    // null = inherit the template's schedule; an array = a per-proposal override.
    paymentMilestones:
      data.paymentMilestones == null
        ? Prisma.JsonNull
        : (cleanPaymentMilestones(data.paymentMilestones) as Prisma.InputJsonValue),
    // null = inherit the template's calculation basis; otherwise this proposal's own.
    milestoneBasis: data.milestoneBasis,
    tcTemplateId: data.tcTemplateId || null,
    tcOverride: data.tcOverride,
    // Ordered T&C section selection compiled into the PDF.
    tcSections: cleanTcSections(data.tcSections) as Prisma.InputJsonValue,
    // Ordered Mode-of-Payment (bank account) selection shown on the PDF.
    modesOfPayment: cleanModesOfPayment(data.modesOfPayment) as Prisma.InputJsonValue,
    // Client-side "Conforme" signatories rendered on the PDF.
    signatories: cleanSignatories(data.signatories) as Prisma.InputJsonValue,
    confidentialWatermark: data.confidentialWatermark,
    hasBelowFloorPricing,
  }

  let savedId: string
  let savedNumber: string

  if (proposalId) {
    // Update existing
    const existing = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { createdBy: { select: { teamId: true } } },
    })
    if (!existing) return { error: 'Proposal not found' }

    // Only the creator, a same-team SALES_MANAGER, or an org-wide role can edit
    if (!canEditProposal(session.user, existing)) {
      return { error: 'Unauthorized' }
    }

    // Cannot edit while PENDING_APPROVAL
    if (existing.status === 'PENDING_APPROVAL') {
      return { error: 'Cannot edit a proposal that is pending approval' }
    }

    await prisma.proposal.update({
      where: { id: proposalId },
      data: proposalData,
    })

    // Replace line items
    await prisma.proposalLineItem.deleteMany({
      where: { proposalId },
    })
    if (data.lineItems.length > 0) {
      await prisma.proposalLineItem.createMany({
        data: data.lineItems.map((li, idx) => ({
          proposalId,
          serviceId: li.serviceId || null,
          customName: li.customName || null,
          description: li.description,
          scopeOfWork: li.scopeOfWork,
          unit: li.unit,
          quantity: li.quantity,
          unitRate: li.unitRate,
          lineTotal: li.lineTotal,
          isOptional: li.isOptional,
          internalNote: li.internalNote || null,
          expenses: cleanLineItemExpenses(li.expenses) as Prisma.InputJsonValue,
          sortOrder: idx,
        })),
      })
    }

    savedId = existing.id
    savedNumber = existing.number
  } else {
    // Create new (number allocated with retry-on-conflict)
    const proposal = await createProposalWithUniqueNumber({
      ...proposalData,
      status: 'DRAFT',
      createdById: session.user.id,
    })
    const number = proposal.number

    if (data.lineItems.length > 0) {
      await prisma.proposalLineItem.createMany({
        data: data.lineItems.map((li, idx) => ({
          proposalId: proposal.id,
          serviceId: li.serviceId || null,
          customName: li.customName || null,
          description: li.description,
          scopeOfWork: li.scopeOfWork,
          unit: li.unit,
          quantity: li.quantity,
          unitRate: li.unitRate,
          lineTotal: li.lineTotal,
          isOptional: li.isOptional,
          internalNote: li.internalNote || null,
          expenses: cleanLineItemExpenses(li.expenses) as Prisma.InputJsonValue,
          sortOrder: idx,
        })),
      })
    }

    await logAudit('Proposal', proposal.id, 'created', session.user.id)

    savedId = proposal.id
    savedNumber = number
  }

  // Auto-link or create the Client record and sync the contact person to the
  // contact book (company rep with department/email/phone)
  if (data.clientName) {
    syncClientFromProposal(
      savedId,
      data.clientId || null,
      data.clientName,
      {
        contactName: data.contactName,
        contactTitle: data.contactTitle,
        department: data.department,
        email: data.contactEmail,
        phone: data.contactPhone,
        businessAddress: data.businessAddress,
        accountCode: data.accountCode,
      },
      session.user.id,
    ).catch(() => {/* non-critical, don't block save */})
  }

  revalidatePath('/proposals')
  return { success: true, proposalId: savedId, proposalNumber: savedNumber }
}

// ─── Explicit save (creates version snapshot) ────────────────────────────────

export async function saveProposalExplicit(
  proposalId: string | null,
  raw: ProposalFormData,
): Promise<
  { success: true; proposalId: string; proposalNumber: string } | { error: string }
> {
  // First save the draft
  const result = await saveProposalDraft(proposalId, raw)
  if ('error' in result) return result

  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  // Create version snapshot
  const proposal = await prisma.proposal.findUnique({
    where: { id: result.proposalId },
    include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!proposal) return { error: 'Proposal not found after save' }

  // Get latest version number
  const latestVersion = await prisma.proposalVersion.findFirst({
    where: { proposalId: result.proposalId },
    orderBy: { versionNumber: 'desc' },
  })
  const nextVersion = (latestVersion?.versionNumber ?? 0) + 1

  // Generate change summary by comparing with previous version
  let changeSummary = 'Initial version.'
  if (latestVersion) {
    changeSummary = generateChangeSummary(
      latestVersion.snapshotJson as Record<string, unknown>,
      { proposal, lineItems: proposal.lineItems },
    )
  }

  await prisma.proposalVersion.create({
    data: {
      proposalId: result.proposalId,
      versionNumber: nextVersion,
      snapshotJson: {
        proposal: serializeProposal(proposal),
        lineItems: proposal.lineItems.map(serializeLineItem),
      } as Prisma.InputJsonValue,
      createdById: session.user.id,
      changeSummary,
      status: proposal.status,
    },
  })

  // Update version counter on proposal
  await prisma.proposal.update({
    where: { id: result.proposalId },
    data: { version: nextVersion },
  })

  return result
}

// ─── Submit for approval ─────────────────────────────────────────────────────

export async function submitProposalForApproval(
  proposalId: string | null,
  raw: ProposalFormData,
): Promise<
  { success: true; proposalId: string; proposalNumber: string } | { error: string }
> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'create:proposal')) return { error: 'Unauthorized' }

  // Validate with strict schema
  const parsed = proposalSubmitSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  // Below-floor pricing is informational only (surfaced to the creator and
  // flagged on the approver notification). The block/escalation rule is retired
  // — the fixed COO → CEO chain reviews all pricing, so routing is unaffected.
  const hasBelowFloor = raw.lineItems.some(
    (li) => li.serviceMinRate != null && li.unitRate < li.serviceMinRate,
  )
  const belowFloorCount = raw.lineItems.filter(
    (li) => li.serviceMinRate != null && li.unitRate < li.serviceMinRate,
  ).length

  // A SUPER_ADMIN submitting their own proposal auto-approves it — no separate
  // approver or approval chain is needed.
  const isSelfApprove = session.user.role === 'SUPER_ADMIN'

  // Everyone else routes into the COO → CEO approval chain, starting with the COO.
  let resolvedApproverId: string
  if (isSelfApprove) {
    resolvedApproverId = session.user.id
  } else {
    const cooId = await resolveCOO()
    if (!cooId) {
      return {
        error:
          'No COO is configured to review proposals. Ask an admin to assign the COO role in Users.',
      }
    }
    resolvedApproverId = cooId
  }

  raw = { ...raw, assignedApproverId: resolvedApproverId }

  // Save with version snapshot (raw carries the resolved approverId)
  const saveResult = await saveProposalExplicit(proposalId, raw)
  if ('error' in saveResult) return saveResult

  // Transition status, also update hasBelowFloorPricing flag. SUPER_ADMIN
  // submissions go straight to APPROVED; everyone else enters the COO stage with
  // a clean approval slate (important when re-submitting after a revision).
  const now = new Date()
  await prisma.proposal.update({
    where: { id: saveResult.proposalId },
    data: {
      status: isSelfApprove ? 'APPROVED' : 'PENDING_APPROVAL',
      hasBelowFloorPricing: hasBelowFloor,
      assignedApproverId: resolvedApproverId,
      cooApprovedAt: isSelfApprove ? now : null,
      cooApprovedById: isSelfApprove ? session.user.id : null,
      ceoApprovedAt: isSelfApprove ? now : null,
      ceoApprovedById: isSelfApprove ? session.user.id : null,
    },
  })

  if (isSelfApprove) {
    await prisma.approvalEvent.createMany({
      data: [
        {
          proposalId: saveResult.proposalId,
          action: 'submitted',
          actorId: session.user.id,
        },
        {
          proposalId: saveResult.proposalId,
          action: 'approved',
          actorId: session.user.id,
          comment: 'Auto-approved on submission by Super Admin.',
        },
      ],
    })
    await createNotification(
      session.user.id,
      `${saveResult.proposalNumber} has been approved. You can now generate the PDF.`,
      `/proposals/${saveResult.proposalId}`,
    )
    await logAudit(
      'Proposal',
      saveResult.proposalId,
      'submitted_and_auto_approved',
      session.user.id,
    )
    revalidatePath('/proposals')
    return saveResult
  }

  // Create approval event
  await prisma.approvalEvent.create({
    data: {
      proposalId: saveResult.proposalId,
      action: 'submitted',
      actorId: session.user.id,
    },
  })

  // Notify + email the COO (first-stage approver)
  const notifyApproverId = resolvedApproverId
  if (notifyApproverId) {
    const belowFloorNote = hasBelowFloor
      ? ` Note: This proposal contains below-floor pricing on ${belowFloorCount} line item${belowFloorCount > 1 ? 's' : ''}.`
      : ''

    await createNotification(
      notifyApproverId,
      `Proposal ${saveResult.proposalNumber} has been submitted for COO review by ${session.user.name}.${belowFloorNote}`,
      `/proposals/${saveResult.proposalId}`,
    )
    const approverUser = await prisma.user.findUnique({
      where: { id: notifyApproverId },
      select: { email: true, name: true },
    })
    if (approverUser) {
      const tpl = approvalRequestEmail({
        approverName: approverUser.name,
        senderName: session.user.name,
        proposalNumber: saveResult.proposalNumber,
        proposalId: saveResult.proposalId,
      })
      await sendEmail(approverUser.email, tpl.subject, tpl.html)
    }
  }

  await logAudit(
    'Proposal',
    saveResult.proposalId,
    'submitted_for_approval',
    session.user.id,
  )

  revalidatePath('/proposals')
  return saveResult
}

// ─── Proposal list query ─────────────────────────────────────────────────────

export type ProposalListItem = {
  id: string
  number: string
  clientName: string
  projectTitle: string
  total: string
  status: string
  version: number
  validUntil: string
  pdfUrl: string | null
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string }
}

export type ProposalSortField =
  | 'number'
  | 'clientName'
  | 'projectTitle'
  | 'total'
  | 'status'
  | 'createdBy'
  | 'createdAt'
  | 'updatedAt'
  | 'version'

export type ProposalListQuery = {
  q?: string
  statuses?: string[]
  dateFrom?: string
  dateTo?: string
  salespersonId?: string
  sort?: ProposalSortField
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export type ProposalsPage = {
  items: ProposalListItem[]
  total: number
  page: number
  pageSize: number
}

export type KanbanColumnData = {
  status: string
  /** Total row count in this column under the current filters (items may be capped). */
  total: number
  /** Sum of proposal totals across the whole column, not just loaded items. */
  totalValue: string
  items: ProposalListItem[]
}

type ProposalFilterQuery = Pick<
  ProposalListQuery,
  'q' | 'statuses' | 'dateFrom' | 'dateTo' | 'salespersonId'
>

const PROPOSAL_SORT_FIELDS: ProposalSortField[] = [
  'number', 'clientName', 'projectTitle', 'total', 'status',
  'createdBy', 'createdAt', 'updatedAt', 'version',
]

const ALL_PROPOSAL_STATUSES = [
  'DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUIRED', 'APPROVED',
  'SENT', 'WON', 'LOST', 'ON_HOLD', 'EXPIRED',
] as const

type ProposalStatusValue = (typeof ALL_PROPOSAL_STATUSES)[number]

function buildProposalWhere(
  user: { id: string; role: string; teamId: string | null },
  query: ProposalFilterQuery,
): Prisma.ProposalWhereInput {
  const conditions: Prisma.ProposalWhereInput[] = []

  // Role scoping always applies; filters can only narrow it further
  if (user.role === 'SALES_EXEC') {
    conditions.push({ createdById: user.id })
  } else if (user.role === 'SALES_MANAGER') {
    conditions.push({ createdBy: { teamId: user.teamId ?? '__none__' } })
  }

  if (query.q?.trim()) {
    const q = query.q.trim()
    conditions.push({
      OR: [
        { clientName: { contains: q, mode: 'insensitive' } },
        { projectTitle: { contains: q, mode: 'insensitive' } },
      ],
    })
  }

  const statuses = query.statuses?.filter((s): s is ProposalStatusValue =>
    (ALL_PROPOSAL_STATUSES as readonly string[]).includes(s),
  )
  if (statuses && statuses.length > 0 && statuses.length < ALL_PROPOSAL_STATUSES.length) {
    conditions.push({ status: { in: statuses } })
  }

  const createdAt: { gte?: Date; lte?: Date } = {}
  if (query.dateFrom) createdAt.gte = new Date(query.dateFrom)
  if (query.dateTo) createdAt.lte = new Date(query.dateTo + 'T23:59:59.999')
  if (createdAt.gte || createdAt.lte) conditions.push({ createdAt })

  if (query.salespersonId && query.salespersonId !== 'all') {
    conditions.push({ createdById: query.salespersonId })
  }

  return conditions.length > 0 ? { AND: conditions } : {}
}

function buildProposalOrderBy(
  sort: ProposalSortField | undefined,
  dir: 'asc' | 'desc',
): Prisma.ProposalOrderByWithRelationInput {
  const field = sort && PROPOSAL_SORT_FIELDS.includes(sort) ? sort : 'updatedAt'
  if (field === 'createdBy') return { createdBy: { name: dir } }
  return { [field]: dir }
}

type ProposalRow = {
  id: string
  number: string
  clientName: string
  projectTitle: string
  total: Prisma.Decimal
  status: string
  version: number
  validUntil: Date
  createdAt: Date
  updatedAt: Date
  createdBy: { id: string; name: string }
  versions?: { pdfUrl: string | null }[]
}

function toProposalListItem(p: ProposalRow): ProposalListItem {
  return {
    id: p.id,
    number: p.number,
    clientName: p.clientName,
    projectTitle: p.projectTitle,
    total: String(p.total),
    status: p.status,
    version: p.version,
    validUntil: p.validUntil.toISOString(),
    pdfUrl: p.versions?.[0]?.pdfUrl ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    createdBy: p.createdBy,
  }
}

export async function getProposalsPage(query: ProposalListQuery = {}): Promise<ProposalsPage> {
  const session = await getSession()
  if (!session) return { items: [], total: 0, page: 1, pageSize: 50 }

  const { user } = session
  const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 100)
  const page = Math.max(query.page ?? 1, 1)
  const where = buildProposalWhere(user, query)

  const [rows, total] = await Promise.all([
    prisma.proposal.findMany({
      where,
      orderBy: buildProposalOrderBy(query.sort, query.dir ?? 'desc'),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { createdBy: { select: { id: true, name: true } } },
    }),
    prisma.proposal.count({ where }),
  ])

  return { items: rows.map(toProposalListItem), total, page, pageSize }
}

export async function getKanbanBoard(
  query: ProposalFilterQuery = {},
  perColumn = 50,
): Promise<KanbanColumnData[]> {
  const session = await getSession()
  if (!session) return []

  const { user } = session
  const where = buildProposalWhere(user, { ...query, statuses: undefined })

  const grouped = await prisma.proposal.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
    _sum: { total: true },
  })
  const byStatus = new Map(grouped.map((g) => [g.status as string, g]))

  return Promise.all(
    ALL_PROPOSAL_STATUSES.map(async (status): Promise<KanbanColumnData> => {
      const group = byStatus.get(status)
      if (!group) return { status, total: 0, totalValue: '0', items: [] }

      const rows = await prisma.proposal.findMany({
        where: { AND: [where, { status }] },
        orderBy: { updatedAt: 'desc' },
        take: perColumn,
        include: {
          createdBy: { select: { id: true, name: true } },
          versions: { select: { pdfUrl: true }, orderBy: { versionNumber: 'desc' }, take: 1 },
        },
      })

      return {
        status,
        total: group._count._all,
        totalValue: String(group._sum.total ?? 0),
        items: rows.map(toProposalListItem),
      }
    }),
  )
}

export async function getKanbanColumnPage(
  status: string,
  query: ProposalFilterQuery,
  skip: number,
  take = 50,
): Promise<{ items: ProposalListItem[] }> {
  const session = await getSession()
  if (!session) return { items: [] }

  if (!(ALL_PROPOSAL_STATUSES as readonly string[]).includes(status)) return { items: [] }

  const { user } = session
  const where = buildProposalWhere(user, { ...query, statuses: undefined })

  const rows = await prisma.proposal.findMany({
    where: { AND: [where, { status: status as ProposalStatusValue }] },
    orderBy: { updatedAt: 'desc' },
    skip,
    take: Math.min(Math.max(take, 1), 100),
    include: {
      createdBy: { select: { id: true, name: true } },
      versions: { select: { pdfUrl: true }, orderBy: { versionNumber: 'desc' }, take: 1 },
    },
  })

  return { items: rows.map(toProposalListItem) }
}

// ─── Proposal detail query ────────────────────────────────────────────────────

export type ProposalVersionEntry = {
  id: string
  versionNumber: number
  changeSummary: string | null
  status: string
  pdfUrl: string | null
  createdAt: string
  createdBy: { id: string; name: string }
}

export type VersionSnapshot = {
  proposal: Record<string, unknown>
  lineItems: Record<string, unknown>[]
}

export type ProposalDetail = {
  id: string
  number: string
  version: number
  clientName: string
  accountCode: string | null
  contactName: string | null
  contactTitle: string | null
  department: string | null
  contactEmail: string | null
  contactPhone: string | null
  businessAddress: string | null
  tin: string | null
  brandName: string | null
  projectTitle: string
  date: string
  validUntil: string
  status: string
  temperature: 'HOT' | 'WARM' | 'COLD' | null
  currency: string
  exchangeRate: string | null
  subtotal: string
  discountType: string | null
  discountValue: string | null
  vatRate: string | null
  total: string
  pricingNotes: string | null
  paymentTermsOverride: string | null
  paymentMilestones: { label: string; dueDate: string; percent: number }[]
  milestoneBasis: MilestoneBasis
  tcOverride: string | null
  confidentialWatermark: boolean
  hasBelowFloorPricing: boolean
  lostReason: string | null
  internalNotes: string | null
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string; email: string }
  assignedApprover: { id: string; name: string } | null
  cooApprovedAt: string | null
  ceoApprovedAt: string | null
  paymentTemplate: { id: string; name: string; bodyRichText: string } | null
  tcTemplate: { id: string; name: string; bodyRichText: string } | null
  // Resolved, ordered T&C sections (override applied) compiled into the PDF.
  tcSections: { tcTemplateId: string; name: string; html: string }[]
  // Resolved, ordered Mode-of-Payment bank accounts shown on the PDF.
  modesOfPayment: ResolvedModeOfPayment[]
  // Client-side "Conforme" signatories rendered on the PDF.
  signatories: Signatory[]
  lineItems: {
    id: string
    serviceId: string | null
    customName: string | null
    description: string
    scopeOfWork: string
    unit: string
    quantity: string
    unitRate: string
    lineTotal: string
    isOptional: boolean
    internalNote: string | null
    expenses: LineItemExpense[]
    sortOrder: number
  }[]
  approvalEvents: {
    id: string
    action: string
    comment: string | null
    createdAt: string
    actor: { id: string; name: string }
  }[]
  versions: ProposalVersionEntry[]
  // User-posted feed items (tasks/notes/files/links), newest first.
  activities: ProposalActivityItem[]
}

export async function getProposalDetail(id: string): Promise<ProposalDetail | null> {
  const session = await getSession()
  if (!session) return null

  const { user } = session

  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true, teamId: true } },
      assignedApprover: { select: { id: true, name: true } },
      paymentTemplate: {
        select: {
          id: true,
          name: true,
          bodyRichText: true,
          milestones: true,
          milestoneBasis: true,
        },
      },
      tcTemplate: { select: { id: true, name: true, bodyRichText: true } },
      lineItems: { orderBy: { sortOrder: 'asc' } },
      approvalEvents: {
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      versions: {
        orderBy: { versionNumber: 'desc' },
        select: {
          id: true,
          versionNumber: true,
          changeSummary: true,
          status: true,
          pdfUrl: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
        },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        include: activityInclude,
      },
    },
  })

  if (!proposal) return null

  // Resolve the ordered T&C section selection (override applied) for display.
  const resolvedTcSections = await resolveTcSections(proposal.tcSections)
  // Resolve the ordered Mode-of-Payment selection to full bank-account details.
  const resolvedModesOfPayment = await resolveModesOfPayment(proposal.modesOfPayment)

  // Enforce visibility rules
  if (!canViewProposal(user, proposal)) return null

  return {
    id: proposal.id,
    number: proposal.number,
    version: proposal.version,
    clientName: proposal.clientName,
    accountCode: proposal.accountCode,
    contactName: proposal.contactName,
    contactTitle: proposal.contactTitle,
    department: proposal.department,
    contactEmail: proposal.contactEmail,
    contactPhone: proposal.contactPhone,
    businessAddress: proposal.businessAddress,
    tin: proposal.tin,
    brandName: proposal.brandName,
    projectTitle: proposal.projectTitle,
    date: proposal.date.toISOString(),
    validUntil: proposal.validUntil.toISOString(),
    status: proposal.status,
    temperature: proposal.temperature,
    currency: proposal.currency,
    exchangeRate: proposal.exchangeRate != null ? String(proposal.exchangeRate) : null,
    subtotal: String(proposal.subtotal),
    discountType: proposal.discountType,
    discountValue: proposal.discountValue != null ? String(proposal.discountValue) : null,
    vatRate: proposal.vatRate != null ? String(proposal.vatRate) : null,
    total: String(proposal.total),
    pricingNotes: proposal.pricingNotes,
    paymentTermsOverride: proposal.paymentTermsOverride,
    // Effective schedule: the proposal's override if it has one, else the template's.
    paymentMilestones:
      proposal.paymentMilestones != null
        ? parsePaymentMilestones(proposal.paymentMilestones)
        : parsePaymentMilestones(proposal.paymentTemplate?.milestones),
    // Basis follows the same source as the effective schedule above.
    milestoneBasis:
      proposal.paymentMilestones != null
        ? normalizeBasis(proposal.milestoneBasis)
        : normalizeBasis(proposal.paymentTemplate?.milestoneBasis),
    tcOverride: proposal.tcOverride,
    confidentialWatermark: proposal.confidentialWatermark,
    hasBelowFloorPricing: proposal.hasBelowFloorPricing,
    lostReason: proposal.lostReason,
    internalNotes: proposal.internalNotes,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    createdBy: {
      id: proposal.createdBy.id,
      name: proposal.createdBy.name,
      email: proposal.createdBy.email,
    },
    assignedApprover: proposal.assignedApprover,
    cooApprovedAt: proposal.cooApprovedAt?.toISOString() ?? null,
    ceoApprovedAt: proposal.ceoApprovedAt?.toISOString() ?? null,
    paymentTemplate: proposal.paymentTemplate,
    tcTemplate: proposal.tcTemplate,
    tcSections: resolvedTcSections,
    modesOfPayment: resolvedModesOfPayment,
    signatories: parseSignatories(proposal.signatories),
    lineItems: proposal.lineItems.map((li) => ({
      id: li.id,
      serviceId: li.serviceId,
      customName: li.customName,
      description: li.description,
      scopeOfWork: li.scopeOfWork,
      unit: li.unit,
      quantity: String(li.quantity),
      unitRate: String(li.unitRate),
      lineTotal: String(li.lineTotal),
      isOptional: li.isOptional,
      internalNote: li.internalNote,
      expenses: parseLineItemExpenses(li.expenses),
      sortOrder: li.sortOrder,
    })),
    approvalEvents: proposal.approvalEvents.map((e) => ({
      id: e.id,
      action: e.action,
      comment: e.comment,
      createdAt: e.createdAt.toISOString(),
      actor: e.actor,
    })),
    versions: proposal.versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      changeSummary: v.changeSummary,
      status: v.status,
      pdfUrl: v.pdfUrl,
      createdAt: v.createdAt.toISOString(),
      createdBy: v.createdBy,
    })),
    activities: proposal.activities.map(serializeActivity),
  }
}

// ─── Lead temperature (Hot/Warm/Cold) ────────────────────────────────────────
// A likelihood-to-close signal, independent of workflow status. Any value or
// null (cleared). Editable by the creator or a manager+ (edit:any_proposal).
export async function setProposalTemperature(
  proposalId: string,
  temperature: 'HOT' | 'WARM' | 'COLD' | null,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  if (temperature !== null && !['HOT', 'WARM', 'COLD'].includes(temperature)) {
    return { error: 'Invalid temperature' }
  }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { createdById: true },
  })
  if (!proposal) return { error: 'Proposal not found' }
  if (proposal.createdById !== session.user.id && !can(session.user, 'edit:any_proposal')) {
    return { error: 'Unauthorized' }
  }

  await prisma.proposal.update({ where: { id: proposalId }, data: { temperature } })
  revalidatePath(`/proposals/${proposalId}`)
  revalidatePath('/proposals')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function getVersionSnapshot(versionId: string): Promise<VersionSnapshot | null> {
  const session = await getSession()
  if (!session) return null

  const { user } = session

  const version = await prisma.proposalVersion.findUnique({
    where: { id: versionId },
    select: {
      snapshotJson: true,
      proposal: {
        select: {
          createdById: true,
          createdBy: { select: { teamId: true } },
        },
      },
    },
  })

  if (!version) return null

  if (user.role === 'SALES_EXEC' && version.proposal.createdById !== user.id) return null
  if (
    user.role === 'SALES_MANAGER' &&
    version.proposal.createdById !== user.id &&
    version.proposal.createdBy.teamId !== user.teamId
  ) return null

  return version.snapshotJson as VersionSnapshot
}

// ─── Duplicate proposal ──────────────────────────────────────────────────────

export async function duplicateProposal(id: string): Promise<{ error: string } | void> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'create:proposal')) return { error: 'Unauthorized' }

  const source = await prisma.proposal.findUnique({
    where: { id },
    include: {
      lineItems: { orderBy: { sortOrder: 'asc' } },
      createdBy: { select: { teamId: true } },
    },
  })
  if (!source) return { error: 'Proposal not found' }
  // Enforce the same read visibility as listings/detail so a user cannot clone
  // (and thereby read) a proposal they aren't allowed to see.
  if (!canViewProposal(session.user, source)) return { error: 'Proposal not found' }

  const settings = await prisma.systemSettings.findFirst()
  const defaultValidityDays = settings?.defaultValidityDays ?? 30

  const today = new Date()
  const validUntil = new Date(today)
  validUntil.setDate(validUntil.getDate() + defaultValidityDays)

  const newProposal = await createProposalWithUniqueNumber({
    version: 1,
    status: 'DRAFT',
    clientName: '',
      accountCode: source.accountCode,
      contactName: source.contactName,
      contactTitle: source.contactTitle,
      department: source.department,
      contactEmail: source.contactEmail,
      contactPhone: source.contactPhone,
      businessAddress: source.businessAddress,
      tin: source.tin,
      brandName: source.brandName,
      projectTitle: source.projectTitle,
      date: today,
      validUntil,
      createdById: session.user.id,
      assignedApproverId: source.assignedApproverId,
      currency: source.currency,
      exchangeRate: source.exchangeRate,
      subtotal: source.subtotal,
      discountType: source.discountType,
      discountValue: source.discountValue,
      vatRate: source.vatRate,
      total: source.total,
      pricingNotes: source.pricingNotes,
      paymentTemplateId: source.paymentTemplateId,
      paymentTermsOverride: source.paymentTermsOverride,
      paymentMilestones:
        source.paymentMilestones === null
          ? Prisma.JsonNull
          : (source.paymentMilestones as Prisma.InputJsonValue),
      milestoneBasis: source.milestoneBasis,
      tcTemplateId: source.tcTemplateId,
      tcOverride: source.tcOverride,
      tcSections:
        source.tcSections == null
          ? Prisma.JsonNull
          : (source.tcSections as Prisma.InputJsonValue),
      modesOfPayment:
        source.modesOfPayment == null
          ? Prisma.JsonNull
          : (source.modesOfPayment as Prisma.InputJsonValue),
      signatories:
        source.signatories == null
          ? Prisma.JsonNull
          : (source.signatories as Prisma.InputJsonValue),
      confidentialWatermark: source.confidentialWatermark,
      hasBelowFloorPricing: source.hasBelowFloorPricing,
      internalNotes: source.internalNotes,
  })

  if (source.lineItems.length > 0) {
    await prisma.proposalLineItem.createMany({
      data: source.lineItems.map((li) => ({
        proposalId: newProposal.id,
        serviceId: li.serviceId,
        customName: li.customName,
        description: li.description,
        scopeOfWork: li.scopeOfWork,
        unit: li.unit,
        quantity: li.quantity,
        unitRate: li.unitRate,
        lineTotal: li.lineTotal,
        isOptional: li.isOptional,
        internalNote: li.internalNote,
        expenses: parseLineItemExpenses(li.expenses) as Prisma.InputJsonValue,
        sortOrder: li.sortOrder,
      })),
    })
  }

  // Initial version snapshot
  await prisma.proposalVersion.create({
    data: {
      proposalId: newProposal.id,
      versionNumber: 1,
      snapshotJson: {
        proposal: serializeProposal(newProposal as unknown as Record<string, unknown>),
        lineItems: source.lineItems.map((li) =>
          serializeLineItem(li as unknown as Record<string, unknown>),
        ),
      } as Prisma.InputJsonValue,
      createdById: session.user.id,
      changeSummary: `Duplicated from ${source.number}.`,
      status: 'DRAFT',
    },
  })

  await logAudit('Proposal', newProposal.id, 'duplicated', session.user.id, {
    sourceId: source.id,
    sourceNumber: source.number,
  })

  revalidatePath('/proposals')
  redirect(`/proposals/${newProposal.id}/edit`)
}

// ─── Approve proposal ────────────────────────────────────────────────────────

export async function approveProposal(
  proposalId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'approve:proposal')) return { error: 'Unauthorized' }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { createdBy: { select: { email: true, name: true } } },
  })
  if (!proposal) return { error: 'Proposal not found' }
  if (proposal.status !== 'PENDING_APPROVAL') return { error: 'Proposal is not pending approval' }

  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'
  if (proposal.assignedApproverId !== session.user.id && !isSuperAdmin) {
    return { error: 'You are not the assigned approver for this stage' }
  }

  const now = new Date()
  // Stage 1 = awaiting COO (cooApprovedAt unset); Stage 2 = awaiting CEO.
  const isCooStage = proposal.cooApprovedAt == null

  // A SUPER_ADMIN can finalise the whole chain in one action (override).
  if (isSuperAdmin) {
    await prisma.proposal.update({
      where: { id: proposalId },
      data: {
        status: 'APPROVED',
        cooApprovedAt: proposal.cooApprovedAt ?? now,
        cooApprovedById: proposal.cooApprovedById ?? session.user.id,
        ceoApprovedAt: now,
        ceoApprovedById: session.user.id,
      },
    })
    await prisma.approvalEvent.create({
      data: { proposalId, action: 'approved', actorId: session.user.id },
    })
    await notifyFinalApproval(proposal.createdById, proposal.createdBy, proposal.number, proposalId)
    await logAudit('Proposal', proposalId, 'approved', session.user.id)
    revalidatePath(`/proposals/${proposalId}`)
    revalidatePath('/proposals')
    return { success: true }
  }

  if (isCooStage) {
    // COO approves → advance to CEO for final sign-off.
    const ceoId = await resolveCEO()
    if (!ceoId) {
      return {
        error:
          'No CEO is configured to give final approval. Ask an admin to assign the CEO role in Users.',
      }
    }

    await prisma.proposal.update({
      where: { id: proposalId },
      data: {
        cooApprovedAt: now,
        cooApprovedById: session.user.id,
        assignedApproverId: ceoId,
      },
    })
    await prisma.approvalEvent.create({
      data: { proposalId, action: 'coo_approved', actorId: session.user.id },
    })

    // Notify the CEO (action needed) and the creator (progress update).
    await createNotification(
      ceoId,
      `${proposal.number} passed COO review and is ready for your final approval.`,
      `/proposals/${proposalId}`,
    )
    await createNotification(
      proposal.createdById,
      `${proposal.number} was approved by the COO and is now awaiting CEO approval.`,
      `/proposals/${proposalId}`,
    )
    const ceo = await prisma.user.findUnique({
      where: { id: ceoId },
      select: { email: true, name: true },
    })
    if (ceo) {
      const tpl = approvalRequestEmail({
        approverName: ceo.name,
        senderName: session.user.name,
        proposalNumber: proposal.number,
        proposalId,
      })
      await sendEmail(ceo.email, tpl.subject, tpl.html)
    }

    await logAudit('Proposal', proposalId, 'coo_approved', session.user.id)
    revalidatePath(`/proposals/${proposalId}`)
    revalidatePath('/proposals')
    return { success: true }
  }

  // CEO stage → final approval, unlocks PDF generation.
  await prisma.proposal.update({
    where: { id: proposalId },
    data: { status: 'APPROVED', ceoApprovedAt: now, ceoApprovedById: session.user.id },
  })
  await prisma.approvalEvent.create({
    data: { proposalId, action: 'approved', actorId: session.user.id },
  })
  await notifyFinalApproval(proposal.createdById, proposal.createdBy, proposal.number, proposalId)
  await logAudit('Proposal', proposalId, 'approved', session.user.id)
  revalidatePath(`/proposals/${proposalId}`)
  revalidatePath('/proposals')
  return { success: true }
}

// Notify + email the creator that their proposal is fully approved.
async function notifyFinalApproval(
  creatorId: string,
  creator: { email: string; name: string } | null,
  proposalNumber: string,
  proposalId: string,
): Promise<void> {
  await createNotification(
    creatorId,
    `${proposalNumber} has been fully approved (COO + CEO). You can now generate the PDF.`,
    `/proposals/${proposalId}`,
  )
  if (creator) {
    const tpl = proposalApprovedEmail({
      creatorName: creator.name,
      proposalNumber,
      proposalId,
    })
    await sendEmail(creator.email, tpl.subject, tpl.html)
  }
}

// ─── Request revision ────────────────────────────────────────────────────────

export async function requestRevision(
  proposalId: string,
  comment: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'approve:proposal')) return { error: 'Unauthorized' }
  if (!comment.trim()) return { error: 'A comment is required when requesting revision' }

  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } })
  if (!proposal) return { error: 'Proposal not found' }
  if (proposal.status !== 'PENDING_APPROVAL') return { error: 'Proposal is not pending approval' }
  if (proposal.assignedApproverId !== session.user.id && session.user.role !== 'SUPER_ADMIN') {
    return { error: 'You are not the assigned approver for this stage' }
  }

  // Reset the COO → CEO chain so a re-submission starts fresh at the COO stage.
  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: 'REVISION_REQUIRED',
      cooApprovedAt: null,
      cooApprovedById: null,
      ceoApprovedAt: null,
      ceoApprovedById: null,
    },
  })

  await prisma.approvalEvent.create({
    data: { proposalId, action: 'revision_requested', actorId: session.user.id, comment },
  })

  await createNotification(
    proposal.createdById,
    `Revision requested on ${proposal.number}: ${comment}`,
    `/proposals/${proposalId}`,
  )

  const creator = await prisma.user.findUnique({
    where: { id: proposal.createdById },
    select: { email: true, name: true },
  })
  if (creator) {
    const tpl = revisionRequestedEmail({
      creatorName: creator.name,
      approverName: session.user.name,
      proposalNumber: proposal.number,
      proposalId,
      comment,
    })
    await sendEmail(creator.email, tpl.subject, tpl.html)
  }

  await logAudit('Proposal', proposalId, 'revision_requested', session.user.id, { comment })
  revalidatePath(`/proposals/${proposalId}`)
  revalidatePath('/proposals')
  return { success: true }
}

// ─── Reject proposal ─────────────────────────────────────────────────────────

export async function rejectProposal(
  proposalId: string,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'approve:proposal')) return { error: 'Unauthorized' }
  if (!reason.trim()) return { error: 'A reason is required when rejecting' }

  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } })
  if (!proposal) return { error: 'Proposal not found' }
  if (proposal.status !== 'PENDING_APPROVAL') return { error: 'Proposal is not pending approval' }
  if (proposal.assignedApproverId !== session.user.id && session.user.role !== 'SUPER_ADMIN') {
    return { error: 'You are not the assigned approver for this stage' }
  }

  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: 'LOST',
      lostReason: `Rejected internally: ${reason}`,
      cooApprovedAt: null,
      cooApprovedById: null,
      ceoApprovedAt: null,
      ceoApprovedById: null,
    },
  })

  await prisma.approvalEvent.create({
    data: { proposalId, action: 'rejected', actorId: session.user.id, comment: reason },
  })

  await createNotification(
    proposal.createdById,
    `${proposal.number} was rejected: ${reason}`,
    `/proposals/${proposalId}`,
  )

  await logAudit('Proposal', proposalId, 'rejected', session.user.id, { reason })
  revalidatePath(`/proposals/${proposalId}`)
  revalidatePath('/proposals')
  return { success: true }
}

// ─── Mark as Sent ────────────────────────────────────────────────────────────

export async function markAsSent(
  proposalId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { createdBy: { select: { teamId: true } } },
  })
  if (!proposal) return { error: 'Proposal not found' }
  if (proposal.status !== 'APPROVED') return { error: 'Only approved proposals can be marked as sent' }

  if (!canEditProposal(session.user, proposal)) {
    return { error: 'Unauthorized' }
  }

  await prisma.proposal.update({ where: { id: proposalId }, data: { status: 'SENT' } })

  await prisma.approvalEvent.create({
    data: { proposalId, action: 'sent', actorId: session.user.id },
  })

  await logAudit('Proposal', proposalId, 'sent', session.user.id)
  revalidatePath(`/proposals/${proposalId}`)
  revalidatePath('/proposals')
  return { success: true }
}

// ─── Mark as Won ─────────────────────────────────────────────────────────────

export async function markAsWon(
  proposalId: string,
  signedDate?: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { createdBy: { include: { team: true } } },
  })
  if (!proposal) return { error: 'Proposal not found' }
  if (proposal.status !== 'SENT' && proposal.status !== 'APPROVED') {
    return { error: 'Only sent or approved proposals can be marked as won' }
  }

  if (!canEditProposal(session.user, proposal)) {
    return { error: 'Unauthorized' }
  }

  await prisma.proposal.update({ where: { id: proposalId }, data: { status: 'WON' } })

  await prisma.approvalEvent.create({
    data: {
      proposalId,
      action: 'won',
      actorId: session.user.id,
      comment: signedDate ? `Signed date: ${signedDate}` : null,
    },
  })

  // Notify creator's manager
  if (proposal.createdBy.team?.managerId) {
    await createNotification(
      proposal.createdBy.team.managerId,
      `${proposal.number} (${proposal.clientName}) was marked as Won.`,
      `/proposals/${proposalId}`,
    )
  }

  await logAudit('Proposal', proposalId, 'won', session.user.id, { signedDate })
  revalidatePath(`/proposals/${proposalId}`)
  revalidatePath('/proposals')
  return { success: true }
}

// ─── Mark as Lost ────────────────────────────────────────────────────────────

export async function markAsLost(
  proposalId: string,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!reason.trim()) return { error: 'A reason is required' }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { createdBy: { include: { team: true } } },
  })
  if (!proposal) return { error: 'Proposal not found' }
  if (proposal.status !== 'SENT' && proposal.status !== 'APPROVED') {
    return { error: 'Only sent or approved proposals can be marked as lost' }
  }

  if (!canEditProposal(session.user, proposal)) {
    return { error: 'Unauthorized' }
  }

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { status: 'LOST', lostReason: reason },
  })

  await prisma.approvalEvent.create({
    data: { proposalId, action: 'lost', actorId: session.user.id, comment: reason },
  })

  // Notify creator's manager
  if (proposal.createdBy.team?.managerId) {
    await createNotification(
      proposal.createdBy.team.managerId,
      `${proposal.number} (${proposal.clientName}) was marked as Lost: ${reason}`,
      `/proposals/${proposalId}`,
    )
  }

  await logAudit('Proposal', proposalId, 'lost', session.user.id, { reason })
  revalidatePath(`/proposals/${proposalId}`)
  revalidatePath('/proposals')
  return { success: true }
}

// ─── Force status override (SUPER_ADMIN only) ─────────────────────────────────

export async function forceOverrideStatus(
  proposalId: string,
  newStatus: string,
  comment: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (session.user.role !== 'SUPER_ADMIN') return { error: 'Unauthorized' }
  if (!comment.trim()) return { error: 'A comment is required for force override' }

  const validStatuses = [
    'DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUIRED', 'APPROVED',
    'SENT', 'WON', 'LOST', 'ON_HOLD', 'EXPIRED',
  ]
  if (!validStatuses.includes(newStatus)) return { error: 'Invalid status' }

  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } })
  if (!proposal) return { error: 'Proposal not found' }

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { status: newStatus as never },
  })

  await prisma.approvalEvent.create({
    data: { proposalId, action: 'overridden', actorId: session.user.id, comment },
  })

  await logAudit('Proposal', proposalId, 'force_overridden', session.user.id, {
    fromStatus: proposal.status,
    toStatus: newStatus,
    comment,
  })

  revalidatePath(`/proposals/${proposalId}`)
  revalidatePath('/proposals')
  return { success: true }
}

// ─── Submit existing proposal (from detail page) ─────────────────────────────

export async function submitExistingProposal(
  proposalId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      lineItems: { orderBy: { sortOrder: 'asc' } },
      createdBy: { select: { teamId: true } },
    },
  })
  if (!proposal) return { error: 'Proposal not found' }

  if (!canEditProposal(session.user, proposal)) {
    return { error: 'Unauthorized' }
  }

  if (proposal.status !== 'DRAFT' && proposal.status !== 'REVISION_REQUIRED') {
    return { error: 'Only draft or revision-required proposals can be submitted' }
  }

  // Validate required fields
  if (!proposal.clientName || proposal.clientName.length < 2) {
    return { error: 'Client name is required (min 2 characters)' }
  }
  if (!proposal.projectTitle || proposal.projectTitle.length < 3) {
    return { error: 'Project title is required (min 3 characters)' }
  }
  if (proposal.lineItems.length === 0) {
    return { error: 'At least one line item is required' }
  }
  if (!proposal.paymentTemplateId && !proposal.paymentTermsOverride) {
    return { error: 'Payment terms are required' }
  }
  if (
    parseTcSections(proposal.tcSections).length === 0 &&
    !proposal.tcTemplateId &&
    !proposal.tcOverride
  ) {
    return { error: 'At least one T&C section is required' }
  }
  if (!parseSignatories(proposal.signatories).some(isCompleteSignatory)) {
    return { error: 'At least one signatory (name, position, and company) is required' }
  }
  if (parseModesOfPayment(proposal.modesOfPayment).length === 0) {
    return { error: 'At least one mode of payment is required' }
  }
  const milestones = parsePaymentMilestones(proposal.paymentMilestones)
  if (
    milestones.length > 0 &&
    !milestonesValidForBasis(milestones, normalizeBasis(proposal.milestoneBasis))
  ) {
    return { error: 'Payment milestones must fully bill the grand total' }
  }
  if (Number(proposal.total) <= 0) {
    return { error: 'Total must be greater than 0' }
  }
  if (proposal.validUntil <= proposal.date) {
    return { error: 'Valid until date must be after the proposal date' }
  }

  // A SUPER_ADMIN submitting their own proposal auto-approves it — no separate
  // approver or approval chain is needed.
  const isSelfApprove = session.user.role === 'SUPER_ADMIN'

  // Everyone else (re)enters the COO → CEO chain at the COO stage. We always
  // route to the COO on submit, even after a revision, so the chain restarts.
  let approverId: string
  if (isSelfApprove) {
    approverId = session.user.id
  } else {
    const cooId = await resolveCOO()
    if (!cooId) {
      return {
        error:
          'No COO is configured to review proposals. Ask an admin to assign the COO role in Users.',
      }
    }
    approverId = cooId
  }

  // Create version snapshot
  const latestVersion = await prisma.proposalVersion.findFirst({
    where: { proposalId },
    orderBy: { versionNumber: 'desc' },
  })
  const nextVersion = (latestVersion?.versionNumber ?? 0) + 1
  const changeSummary = latestVersion
    ? generateChangeSummary(latestVersion.snapshotJson as Record<string, unknown>, {
        proposal,
        lineItems: proposal.lineItems,
      })
    : 'Initial version.'

  await prisma.proposalVersion.create({
    data: {
      proposalId,
      versionNumber: nextVersion,
      snapshotJson: {
        proposal: serializeProposal(proposal),
        lineItems: proposal.lineItems.map(serializeLineItem),
      } as Prisma.InputJsonValue,
      createdById: session.user.id,
      changeSummary,
      status: isSelfApprove ? 'APPROVED' : 'PENDING_APPROVAL',
    },
  })

  const now = new Date()
  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: isSelfApprove ? 'APPROVED' : 'PENDING_APPROVAL',
      version: nextVersion,
      assignedApproverId: approverId,
      cooApprovedAt: isSelfApprove ? now : null,
      cooApprovedById: isSelfApprove ? session.user.id : null,
      ceoApprovedAt: isSelfApprove ? now : null,
      ceoApprovedById: isSelfApprove ? session.user.id : null,
    },
  })

  if (isSelfApprove) {
    await prisma.approvalEvent.createMany({
      data: [
        { proposalId, action: 'submitted', actorId: session.user.id },
        {
          proposalId,
          action: 'approved',
          actorId: session.user.id,
          comment: 'Auto-approved on submission by Super Admin.',
        },
      ],
    })
    await createNotification(
      proposal.createdById,
      `${proposal.number} has been approved. You can now generate the PDF.`,
      `/proposals/${proposalId}`,
    )
  } else {
    await prisma.approvalEvent.create({
      data: { proposalId, action: 'submitted', actorId: session.user.id },
    })

    const approver = await prisma.user.findUnique({ where: { id: approverId } })
    if (approver) {
      await createNotification(
        approver.id,
        `${proposal.number} has been submitted for COO review by ${session.user.name}.`,
        `/proposals/${proposalId}`,
      )
    }
  }

  await logAudit(
    'Proposal',
    proposalId,
    isSelfApprove ? 'submitted_and_auto_approved' : 'submitted_for_approval',
    session.user.id,
  )
  revalidatePath(`/proposals/${proposalId}`)
  revalidatePath('/proposals')
  return { success: true }
}

// ─── Pending approvals (for dashboard) ───────────────────────────────────────

export type PendingApprovalItem = {
  id: string
  number: string
  clientName: string
  projectTitle: string
  total: string
  updatedAt: string
  createdBy: { id: string; name: string }
}

export async function getPendingApprovals(): Promise<PendingApprovalItem[]> {
  const session = await getSession()
  if (!session) return []
  if (!can(session.user, 'approve:proposal')) return []

  const proposals = await prisma.proposal.findMany({
    where: {
      status: 'PENDING_APPROVAL',
      assignedApproverId: session.user.id,
    },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'asc' },
  })

  return proposals.map((p) => ({
    id: p.id,
    number: p.number,
    clientName: p.clientName,
    projectTitle: p.projectTitle,
    total: String(p.total),
    updatedAt: p.updatedAt.toISOString(),
    createdBy: p.createdBy,
  }))
}

// ─── Get proposal data for edit wizard ───────────────────────────────────────

export type ProposalFormDataExport = {
  clientId: string | null
  clientName: string
  accountCode: string
  contactName: string
  contactTitle: string
  department: string
  contactEmail: string
  contactPhone: string
  businessAddress: string
  tin: string
  brandName: string
  projectTitle: string
  date: string
  validUntil: string
  assignedApproverId: string
  lineItems: {
    id: string
    serviceId: string | null
    customName: string
    description: string
    scopeOfWork: string
    unit: string
    quantity: number
    unitRate: number
    lineTotal: number
    isOptional: boolean
    internalNote: string
    expenses: LineItemExpense[]
    sortOrder: number
    serviceName: string
    serviceMinRate: number | null
  }[]
  currency: string
  exchangeRate: number | null
  discountType: 'percentage' | 'fixed' | null
  discountValue: number | null
  discountLabel: string
  vatEnabled: boolean
  vatRate: number
  pricingNotes: string
  paymentTemplateId: string
  paymentTermsOverride: string | null
  paymentMilestones: { id: string; label: string; dueDate: string; percent: number }[] | null
  milestoneBasis: MilestoneBasis | null
  tcTemplateId: string
  tcOverride: string | null
  tcSections: TcSectionFormData[]
  modesOfPayment: ModeOfPaymentSelectionFormData[]
  signatories: SignatoryFormData[]
  confidentialWatermark: boolean
}

export type ProposalEditData = {
  proposalId: string
  proposalNumber: string
  formData: ProposalFormDataExport
}

export async function getProposalForEdit(
  proposalId: string,
): Promise<{ data: ProposalEditData } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      lineItems: {
        orderBy: { sortOrder: 'asc' },
        include: { service: { select: { id: true, name: true, minRate: true } } },
      },
      createdBy: { select: { teamId: true } },
    },
  })
  if (!proposal) return { error: 'Proposal not found' }

  // Permission check (own, same-team manager, or org-wide role)
  if (!canEditProposal(session.user, proposal)) {
    return { error: 'Unauthorized' }
  }

  if (proposal.status !== 'DRAFT' && proposal.status !== 'REVISION_REQUIRED') {
    return { error: 'This proposal cannot be edited in its current status' }
  }

  const formData: ProposalFormDataExport = {
    clientId: proposal.clientId ?? null,
    clientName: proposal.clientName,
    accountCode: proposal.accountCode ?? '',
    contactName: proposal.contactName ?? '',
    contactTitle: proposal.contactTitle ?? '',
    department: proposal.department ?? '',
    contactEmail: proposal.contactEmail ?? '',
    contactPhone: proposal.contactPhone ?? '',
    businessAddress: proposal.businessAddress ?? '',
    tin: proposal.tin ?? '',
    brandName: proposal.brandName ?? '',
    projectTitle: proposal.projectTitle,
    date: proposal.date.toISOString().split('T')[0],
    validUntil: proposal.validUntil.toISOString().split('T')[0],
    assignedApproverId: proposal.assignedApproverId ?? '',
    lineItems: proposal.lineItems.map((li) => ({
      id: li.id,
      serviceId: li.serviceId,
      customName: li.customName ?? '',
      description: li.description,
      scopeOfWork: li.scopeOfWork,
      unit: li.unit,
      quantity: Number(li.quantity),
      unitRate: Number(li.unitRate),
      lineTotal: Number(li.lineTotal),
      isOptional: li.isOptional,
      internalNote: li.internalNote ?? '',
      expenses: parseLineItemExpenses(li.expenses),
      sortOrder: li.sortOrder,
      serviceName: li.service?.name ?? '',
      serviceMinRate: li.service?.minRate != null ? Number(li.service.minRate) : null,
    })),
    currency: proposal.currency,
    exchangeRate: proposal.exchangeRate != null ? Number(proposal.exchangeRate) : null,
    discountType: proposal.discountType as 'percentage' | 'fixed' | null,
    discountValue: proposal.discountValue != null ? Number(proposal.discountValue) : null,
    discountLabel: '',
    vatEnabled: proposal.vatRate != null,
    vatRate: proposal.vatRate != null ? Number(proposal.vatRate) : 12,
    pricingNotes: proposal.pricingNotes ?? '',
    paymentTemplateId: proposal.paymentTemplateId ?? '',
    paymentTermsOverride: proposal.paymentTermsOverride,
    // null = inherit the template's schedule (no per-proposal override stored).
    paymentMilestones:
      proposal.paymentMilestones == null
        ? null
        : parsePaymentMilestones(proposal.paymentMilestones).map((m, i) => ({
            id: `ms-${i}`,
            ...m,
          })),
    // null = inherit the template's basis, mirroring paymentMilestones above.
    milestoneBasis:
      proposal.paymentMilestones == null ? null : normalizeBasis(proposal.milestoneBasis),
    tcTemplateId: proposal.tcTemplateId ?? '',
    tcOverride: proposal.tcOverride,
    tcSections: parseTcSections(proposal.tcSections),
    modesOfPayment: parseModesOfPayment(proposal.modesOfPayment),
    signatories: parseSignatories(proposal.signatories).map((s, i) => ({
      id: `sig-${i}`,
      ...s,
    })),
    confidentialWatermark: proposal.confidentialWatermark,
  }

  return {
    data: {
      proposalId: proposal.id,
      proposalNumber: proposal.number,
      formData,
    },
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeProposal(p: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(p)) {
    if (k === 'lineItems') continue // handled separately
    if (v instanceof Date) {
      result[k] = v.toISOString()
    } else if (typeof v === 'bigint' || (v && typeof v === 'object' && 'toNumber' in v)) {
      result[k] = String(v)
    } else {
      result[k] = v
    }
  }
  return result
}

function serializeLineItem(li: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(li)) {
    if (v instanceof Date) {
      result[k] = v.toISOString()
    } else if (typeof v === 'bigint' || (v && typeof v === 'object' && 'toNumber' in v)) {
      result[k] = String(v)
    } else {
      result[k] = v
    }
  }
  return result
}

function generateChangeSummary(
  prevSnapshot: Record<string, unknown>,
  current: { proposal: Record<string, unknown>; lineItems: Record<string, unknown>[] },
): string {
  const changes: string[] = []
  const prev = prevSnapshot as {
    proposal?: Record<string, unknown>
    lineItems?: Record<string, unknown>[]
  }

  if (!prev.proposal) return 'Initial version.'

  // Check key field changes
  const fields = ['clientName', 'projectTitle', 'total', 'subtotal'] as const
  for (const field of fields) {
    const prevVal = String(prev.proposal[field] ?? '')
    const currVal = String(current.proposal[field] ?? '')
    if (prevVal !== currVal) {
      changes.push(
        `${field === 'clientName' ? 'Client name' : field === 'projectTitle' ? 'Project title' : field === 'total' ? 'Total' : 'Subtotal'} changed from ${prevVal} to ${currVal}.`,
      )
    }
  }

  // Check line item additions/removals
  const prevItems = (prev.lineItems ?? []) as Record<string, unknown>[]
  const prevNames = new Set(prevItems.map((li) => String(li.description ?? li.customName ?? '')))
  const currNames = new Set(
    current.lineItems.map((li) => String(li.description ?? li.customName ?? '')),
  )

  for (const name of Array.from(currNames)) {
    if (!prevNames.has(name)) {
      changes.push(`Added line item: ${name}.`)
    }
  }
  for (const name of Array.from(prevNames)) {
    if (!currNames.has(name)) {
      changes.push(`Removed line item: ${name}.`)
    }
  }

  // Check rate changes
  for (const currLi of current.lineItems) {
    const prevLi = prevItems.find(
      (p) => String(p.serviceId ?? '') === String(currLi.serviceId ?? '') && String(p.description ?? '') === String(currLi.description ?? ''),
    )
    if (prevLi && String(prevLi.unitRate) !== String(currLi.unitRate)) {
      changes.push(
        `Rate for ${currLi.description} changed from ${prevLi.unitRate} to ${currLi.unitRate}.`,
      )
    }
  }

  // Check payment/TC overrides
  if (String(prev.proposal.paymentTermsOverride ?? '') !== String(current.proposal.paymentTermsOverride ?? '')) {
    changes.push('Payment terms overridden from template.')
  }
  if (normalizeBasis(prev.proposal.milestoneBasis) !== normalizeBasis(current.proposal.milestoneBasis)) {
    changes.push(
      normalizeBasis(current.proposal.milestoneBasis) === 'remaining'
        ? 'Payment schedule switched to split-the-remaining-balance.'
        : 'Payment schedule switched to share-of-grand-total.',
    )
  }
  if (String(prev.proposal.tcOverride ?? '') !== String(current.proposal.tcOverride ?? '')) {
    changes.push('Terms & conditions overridden from template.')
  }
  if (
    JSON.stringify(parseTcSections(prev.proposal.tcSections)) !==
    JSON.stringify(parseTcSections(current.proposal.tcSections))
  ) {
    changes.push('Terms & conditions sections updated.')
  }
  if (
    JSON.stringify(parseModesOfPayment(prev.proposal.modesOfPayment)) !==
    JSON.stringify(parseModesOfPayment(current.proposal.modesOfPayment))
  ) {
    changes.push('Modes of payment updated.')
  }
  if (
    JSON.stringify(parseSignatories(prev.proposal.signatories)) !==
    JSON.stringify(parseSignatories(current.proposal.signatories))
  ) {
    changes.push('Signatories updated.')
  }

  return changes.length > 0 ? changes.join(' ') : 'No changes from previous version.'
}

// ─── Restore proposal version ─────────────────────────────────────────────────

export async function restoreVersion(
  proposalId: string,
  versionId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } })
  if (!proposal) return { error: 'Proposal not found' }

  const canEditOwn = proposal.createdById === session.user.id
  const canEditAny = can(session.user, 'edit:any_proposal')
  if (!canEditOwn && !canEditAny) return { error: 'Unauthorized' }

  // Restore rewrites all fields and forces status to DRAFT, which would bypass
  // the "cannot edit while pending approval" lock (enforced in saveProposalDraft)
  // and silently discard an in-flight or completed approval. Only allow it while
  // the proposal is already editable.
  if (proposal.status !== 'DRAFT' && proposal.status !== 'REVISION_REQUIRED') {
    return {
      error:
        'This proposal can only be restored while it is a draft or awaiting revision.',
    }
  }

  const version = await prisma.proposalVersion.findUnique({ where: { id: versionId } })
  if (!version || version.proposalId !== proposalId) return { error: 'Version not found' }

  const snapshot = version.snapshotJson as {
    proposal: Record<string, unknown>
    lineItems: Record<string, unknown>[]
  }
  const sp = snapshot.proposal

  // Get next version number
  const latestVersion = await prisma.proposalVersion.findFirst({
    where: { proposalId },
    orderBy: { versionNumber: 'desc' },
  })
  const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1

  // Update proposal fields from snapshot, reset to DRAFT
  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      version: nextVersionNumber,
      status: 'DRAFT',
      clientName: String(sp.clientName ?? ''),
      accountCode: sp.accountCode ? String(sp.accountCode) : null,
      contactName: sp.contactName ? String(sp.contactName) : null,
      contactTitle: sp.contactTitle ? String(sp.contactTitle) : null,
      department: sp.department ? String(sp.department) : null,
      contactEmail: sp.contactEmail ? String(sp.contactEmail) : null,
      contactPhone: sp.contactPhone ? String(sp.contactPhone) : null,
      businessAddress: sp.businessAddress ? String(sp.businessAddress) : null,
      tin: sp.tin ? String(sp.tin) : null,
      brandName: sp.brandName ? String(sp.brandName) : null,
      projectTitle: String(sp.projectTitle ?? ''),
      date: new Date(String(sp.date)),
      validUntil: new Date(String(sp.validUntil)),
      currency: String(sp.currency ?? 'PHP'),
      exchangeRate:
        sp.exchangeRate != null ? new Prisma.Decimal(String(sp.exchangeRate)) : null,
      subtotal: new Prisma.Decimal(String(sp.subtotal ?? '0')),
      discountType: sp.discountType ? String(sp.discountType) : null,
      discountValue: sp.discountValue != null ? new Prisma.Decimal(String(sp.discountValue)) : null,
      vatRate: sp.vatRate != null ? new Prisma.Decimal(String(sp.vatRate)) : null,
      total: new Prisma.Decimal(String(sp.total ?? '0')),
      pricingNotes: sp.pricingNotes ? String(sp.pricingNotes) : null,
      paymentTemplateId: sp.paymentTemplateId ? String(sp.paymentTemplateId) : null,
      paymentTermsOverride: sp.paymentTermsOverride ? String(sp.paymentTermsOverride) : null,
      paymentMilestones:
        sp.paymentMilestones == null
          ? Prisma.JsonNull
          : (cleanPaymentMilestones(
              parsePaymentMilestones(sp.paymentMilestones),
            ) as Prisma.InputJsonValue),
      milestoneBasis: sp.milestoneBasis ? String(sp.milestoneBasis) : null,
      tcTemplateId: sp.tcTemplateId ? String(sp.tcTemplateId) : null,
      tcOverride: sp.tcOverride ? String(sp.tcOverride) : null,
      tcSections: cleanTcSections(parseTcSections(sp.tcSections)) as Prisma.InputJsonValue,
      modesOfPayment: cleanModesOfPayment(
        parseModesOfPayment(sp.modesOfPayment),
      ) as Prisma.InputJsonValue,
      signatories: cleanSignatories(parseSignatories(sp.signatories)) as Prisma.InputJsonValue,
      confidentialWatermark: Boolean(sp.confidentialWatermark),
      hasBelowFloorPricing: Boolean(sp.hasBelowFloorPricing),
      internalNotes: sp.internalNotes ? String(sp.internalNotes) : null,
    },
  })

  // Replace line items with snapshot data
  await prisma.proposalLineItem.deleteMany({ where: { proposalId } })
  await prisma.proposalLineItem.createMany({
    data: snapshot.lineItems.map((li) => ({
      proposalId,
      serviceId: li.serviceId ? String(li.serviceId) : null,
      customName: li.customName ? String(li.customName) : null,
      description: String(li.description ?? ''),
      scopeOfWork: String(li.scopeOfWork ?? ''),
      unit: String(li.unit ?? ''),
      quantity: new Prisma.Decimal(String(li.quantity ?? '1')),
      unitRate: new Prisma.Decimal(String(li.unitRate ?? '0')),
      lineTotal: new Prisma.Decimal(String(li.lineTotal ?? '0')),
      isOptional: Boolean(li.isOptional),
      internalNote: li.internalNote ? String(li.internalNote) : null,
      expenses: parseLineItemExpenses(li.expenses) as Prisma.InputJsonValue,
      sortOrder: Number(li.sortOrder ?? 0),
    })),
  })

  // Create a new ProposalVersion recording this restore
  const restored = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
  })
  if (restored) {
    await prisma.proposalVersion.create({
      data: {
        proposalId,
        versionNumber: nextVersionNumber,
        snapshotJson: {
          proposal: serializeProposal(restored as unknown as Record<string, unknown>),
          lineItems: restored.lineItems.map((li) =>
            serializeLineItem(li as unknown as Record<string, unknown>),
          ),
        } as Prisma.InputJsonValue,
        createdById: session.user.id,
        changeSummary: `Restored from v${version.versionNumber}.`,
        status: 'DRAFT',
      },
    })
  }

  await logAudit('ProposalVersion', versionId, 'restored', session.user.id)
  revalidatePath(`/proposals/${proposalId}`)

  return { success: true }
}

// ─── Mark as On Hold ──────────────────────────────────────────────────────────

export async function markOnHold(
  proposalId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { createdBy: { select: { teamId: true } } },
  })
  if (!proposal) return { error: 'Proposal not found' }

  const activeStatuses = ['DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUIRED', 'APPROVED', 'SENT']
  if (!activeStatuses.includes(proposal.status)) {
    return { error: 'Only active proposals can be put on hold' }
  }

  if (!canEditProposal(session.user, proposal)) {
    return { error: 'Unauthorized' }
  }

  await prisma.proposal.update({ where: { id: proposalId }, data: { status: 'ON_HOLD' } })

  await prisma.approvalEvent.create({
    data: { proposalId, action: 'on_hold', actorId: session.user.id },
  })

  await logAudit('Proposal', proposalId, 'on_hold', session.user.id)
  revalidatePath(`/proposals/${proposalId}`)
  revalidatePath('/proposals')
  return { success: true }
}

// ─── Revert to Draft (from On Hold) ──────────────────────────────────────────

export async function revertToDraft(
  proposalId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { createdBy: { select: { teamId: true } } },
  })
  if (!proposal) return { error: 'Proposal not found' }

  if (proposal.status !== 'ON_HOLD') {
    return { error: 'Only on-hold proposals can be reverted to draft' }
  }

  if (!canEditProposal(session.user, proposal)) {
    return { error: 'Unauthorized' }
  }

  await prisma.proposal.update({ where: { id: proposalId }, data: { status: 'DRAFT' } })

  await prisma.approvalEvent.create({
    data: { proposalId, action: 'reverted_to_draft', actorId: session.user.id },
  })

  await logAudit('Proposal', proposalId, 'reverted_to_draft', session.user.id)
  revalidatePath(`/proposals/${proposalId}`)
  revalidatePath('/proposals')
  return { success: true }
}
