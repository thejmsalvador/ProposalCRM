'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '../generated/prisma/client'
import { getSession } from '../auth'
import { can } from '../permissions'
import { prisma } from '../prisma'
import { logAudit } from '../audit'
import { createNotification } from '../notifications'
import {
  proposalDraftSchema,
  proposalSubmitSchema,
  computeSubtotal,
  computeTotal,
  type ProposalFormData,
} from '../validations/proposals'

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
  defaultRate: string
  minRate: string | null
  maxRate: string | null
}

export type PaymentTemplateOption = {
  id: string
  name: string
  bodyRichText: string
  isDefault: boolean
}

export type TCTemplateOption = {
  id: string
  name: string
  bodyRichText: string
  categories: string[]
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
  approvers: ApproverOption[]
  services: ServiceOption[]
  paymentTemplates: PaymentTemplateOption[]
  tcTemplates: TCTemplateOption[]
  systemSettings: SystemSettingsData
}> {
  const [approvers, services, paymentTemplates, tcTemplates, settings] =
    await Promise.all([
      prisma.user.findMany({
        where: {
          role: { in: ['SALES_MANAGER', 'SUPER_ADMIN'] },
          isActive: true,
        },
        select: { id: true, name: true, role: true },
        orderBy: { name: 'asc' },
      }),
      prisma.service.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          category: true,
          description: true,
          defaultScope: true,
          unit: true,
          defaultRate: true,
          minRate: true,
          maxRate: true,
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      prisma.paymentTemplate.findMany({
        where: { isArchived: false },
        select: { id: true, name: true, bodyRichText: true, isDefault: true },
        orderBy: { name: 'asc' },
      }),
      prisma.tCTemplate.findMany({
        where: { isArchived: false },
        select: { id: true, name: true, bodyRichText: true, categories: true },
        orderBy: { name: 'asc' },
      }),
      prisma.systemSettings.findFirst(),
    ])

  return {
    approvers: approvers.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
    })),
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
      defaultScope: s.defaultScope,
      unit: s.unit,
      defaultRate: String(s.defaultRate),
      minRate: s.minRate != null ? String(s.minRate) : null,
      maxRate: s.maxRate != null ? String(s.maxRate) : null,
    })),
    paymentTemplates: paymentTemplates.map((p) => ({
      id: p.id,
      name: p.name,
      bodyRichText: p.bodyRichText,
      isDefault: p.isDefault,
    })),
    tcTemplates: tcTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      bodyRichText: t.bodyRichText,
      categories: t.categories,
    })),
    systemSettings: {
      defaultValidityDays: settings?.defaultValidityDays ?? 30,
      defaultCurrency: settings?.defaultCurrency ?? 'PHP',
      defaultVatRate: String(settings?.defaultVatRate ?? 12),
      agencyName: settings?.agencyName ?? 'The Agency',
    },
  }
}

// ─── Proposal number generation ──────────────────────────────────────────────

async function generateProposalNumber(): Promise<string> {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const prefix = `PROP-${yyyy}-${mm}-`

  const latest = await prisma.proposal.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
  })

  const next = latest ? parseInt(latest.number.split('-')[3]) + 1 : 1
  return `${prefix}${String(next).padStart(4, '0')}`
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
    clientName: data.clientName || 'Untitled',
    contactName: data.contactName || null,
    contactTitle: data.contactTitle || null,
    projectTitle: data.projectTitle || 'Untitled Project',
    date: data.date ? new Date(data.date) : new Date(),
    validUntil: data.validUntil ? new Date(data.validUntil) : new Date(),
    assignedApproverId: data.assignedApproverId || null,
    introText: data.introText || null,
    currency: data.currency,
    subtotal,
    discountType: data.discountType,
    discountValue: data.discountValue,
    vatRate: data.vatEnabled ? data.vatRate : null,
    total,
    pricingNotes: data.pricingNotes || null,
    paymentTemplateId: data.paymentTemplateId || null,
    paymentTermsOverride: data.paymentTermsOverride,
    tcTemplateId: data.tcTemplateId || null,
    tcOverride: data.tcOverride,
    confidentialWatermark: data.confidentialWatermark,
    hasBelowFloorPricing,
  }

  let savedId: string
  let savedNumber: string

  if (proposalId) {
    // Update existing
    const existing = await prisma.proposal.findUnique({
      where: { id: proposalId },
    })
    if (!existing) return { error: 'Proposal not found' }

    // Only the creator or someone with edit:any_proposal can edit
    if (
      existing.createdById !== session.user.id &&
      !can(session.user, 'edit:any_proposal')
    ) {
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
          sortOrder: idx,
        })),
      })
    }

    savedId = existing.id
    savedNumber = existing.number
  } else {
    // Create new
    const number = await generateProposalNumber()

    const proposal = await prisma.proposal.create({
      data: {
        ...proposalData,
        number,
        status: 'DRAFT',
        createdById: session.user.id,
      },
    })

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
          sortOrder: idx,
        })),
      })
    }

    await logAudit('Proposal', proposal.id, 'created', session.user.id)

    savedId = proposal.id
    savedNumber = number
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

  // Check below-floor pricing requires SALES_MANAGER approver
  const hasBelowFloor = raw.lineItems.some(
    (li) => li.serviceMinRate != null && li.unitRate < li.serviceMinRate,
  )
  if (hasBelowFloor && raw.assignedApproverId) {
    const approver = await prisma.user.findUnique({
      where: { id: raw.assignedApproverId },
    })
    if (approver && approver.role !== 'SALES_MANAGER' && approver.role !== 'SUPER_ADMIN') {
      return {
        error:
          'Below-floor pricing detected. A Sales Manager must be assigned as approver.',
      }
    }
  }

  // Save with version snapshot
  const saveResult = await saveProposalExplicit(proposalId, raw)
  if ('error' in saveResult) return saveResult

  // Transition to PENDING_APPROVAL
  await prisma.proposal.update({
    where: { id: saveResult.proposalId },
    data: { status: 'PENDING_APPROVAL' },
  })

  // Create approval event
  await prisma.approvalEvent.create({
    data: {
      proposalId: saveResult.proposalId,
      action: 'submitted',
      actorId: session.user.id,
    },
  })

  // Notify the assigned approver
  if (raw.assignedApproverId) {
    await createNotification(
      raw.assignedApproverId,
      `Proposal ${saveResult.proposalNumber} has been submitted for your approval by ${session.user.name}.`,
      `/proposals/${saveResult.proposalId}`,
    )
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
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string }
}

export async function getProposals(): Promise<ProposalListItem[]> {
  const session = await getSession()
  if (!session) return []

  const { user } = session

  let where: Record<string, unknown> = {}

  if (user.role === 'SALES_EXEC') {
    where = { createdById: user.id }
  } else if (user.role === 'SALES_MANAGER') {
    where = { createdBy: { teamId: user.teamId ?? '__none__' } }
  }
  // ADMIN / SUPER_ADMIN: no filter

  const proposals = await prisma.proposal.findMany({
    where,
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  return proposals.map((p) => ({
    id: p.id,
    number: p.number,
    clientName: p.clientName,
    projectTitle: p.projectTitle,
    total: String(p.total),
    status: p.status,
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    createdBy: p.createdBy,
  }))
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
  snapshotJson: {
    proposal: Record<string, unknown>
    lineItems: Record<string, unknown>[]
  }
}

export type ProposalDetail = {
  id: string
  number: string
  version: number
  clientName: string
  contactName: string | null
  contactTitle: string | null
  projectTitle: string
  date: string
  validUntil: string
  status: string
  currency: string
  subtotal: string
  discountType: string | null
  discountValue: string | null
  vatRate: string | null
  total: string
  pricingNotes: string | null
  introText: string | null
  paymentTermsOverride: string | null
  tcOverride: string | null
  confidentialWatermark: boolean
  hasBelowFloorPricing: boolean
  lostReason: string | null
  internalNotes: string | null
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string; email: string }
  assignedApprover: { id: string; name: string } | null
  paymentTemplate: { id: string; name: string; bodyRichText: string } | null
  tcTemplate: { id: string; name: string; bodyRichText: string } | null
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
}

export async function getProposalDetail(id: string): Promise<ProposalDetail | null> {
  const session = await getSession()
  if (!session) return null

  const { user } = session

  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      assignedApprover: { select: { id: true, name: true } },
      paymentTemplate: { select: { id: true, name: true, bodyRichText: true } },
      tcTemplate: { select: { id: true, name: true, bodyRichText: true } },
      lineItems: { orderBy: { sortOrder: 'asc' } },
      approvalEvents: {
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      versions: { orderBy: { versionNumber: 'desc' } },
    },
  })

  if (!proposal) return null

  // Enforce visibility rules
  if (
    user.role === 'SALES_EXEC' &&
    proposal.createdById !== user.id
  ) return null

  if (
    user.role === 'SALES_MANAGER' &&
    proposal.createdBy.id !== user.id
  ) {
    // Allow if same team — re-fetch with team check
    const creator = await prisma.user.findUnique({
      where: { id: proposal.createdById },
      select: { teamId: true },
    })
    if (!creator || creator.teamId !== user.teamId) return null
  }

  // Fetch version creators (ProposalVersion has no relation to User in schema)
  const versionCreatorIds = Array.from(new Set(proposal.versions.map((v) => v.createdById)))
  const versionCreators = versionCreatorIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: versionCreatorIds } },
        select: { id: true, name: true },
      })
    : []
  const creatorMap = Object.fromEntries(versionCreators.map((u) => [u.id, u]))

  return {
    id: proposal.id,
    number: proposal.number,
    version: proposal.version,
    clientName: proposal.clientName,
    contactName: proposal.contactName,
    contactTitle: proposal.contactTitle,
    projectTitle: proposal.projectTitle,
    date: proposal.date.toISOString(),
    validUntil: proposal.validUntil.toISOString(),
    status: proposal.status,
    currency: proposal.currency,
    subtotal: String(proposal.subtotal),
    discountType: proposal.discountType,
    discountValue: proposal.discountValue != null ? String(proposal.discountValue) : null,
    vatRate: proposal.vatRate != null ? String(proposal.vatRate) : null,
    total: String(proposal.total),
    pricingNotes: proposal.pricingNotes,
    introText: proposal.introText,
    paymentTermsOverride: proposal.paymentTermsOverride,
    tcOverride: proposal.tcOverride,
    confidentialWatermark: proposal.confidentialWatermark,
    hasBelowFloorPricing: proposal.hasBelowFloorPricing,
    lostReason: proposal.lostReason,
    internalNotes: proposal.internalNotes,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    createdBy: proposal.createdBy,
    assignedApprover: proposal.assignedApprover,
    paymentTemplate: proposal.paymentTemplate,
    tcTemplate: proposal.tcTemplate,
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
      createdBy: creatorMap[v.createdById] ?? { id: v.createdById, name: 'Unknown' },
      snapshotJson: v.snapshotJson as {
        proposal: Record<string, unknown>
        lineItems: Record<string, unknown>[]
      },
    })),
  }
}

// ─── Duplicate proposal ──────────────────────────────────────────────────────

export async function duplicateProposal(id: string): Promise<{ error: string } | void> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }
  if (!can(session.user, 'create:proposal')) return { error: 'Unauthorized' }

  const source = await prisma.proposal.findUnique({
    where: { id },
    include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!source) return { error: 'Proposal not found' }

  const settings = await prisma.systemSettings.findFirst()
  const defaultValidityDays = settings?.defaultValidityDays ?? 30

  const today = new Date()
  const validUntil = new Date(today)
  validUntil.setDate(validUntil.getDate() + defaultValidityDays)

  const newNumber = await generateProposalNumber()

  const newProposal = await prisma.proposal.create({
    data: {
      number: newNumber,
      version: 1,
      status: 'DRAFT',
      clientName: '',
      contactName: source.contactName,
      contactTitle: source.contactTitle,
      projectTitle: source.projectTitle,
      date: today,
      validUntil,
      createdById: session.user.id,
      assignedApproverId: source.assignedApproverId,
      currency: source.currency,
      subtotal: source.subtotal,
      discountType: source.discountType,
      discountValue: source.discountValue,
      vatRate: source.vatRate,
      total: source.total,
      pricingNotes: source.pricingNotes,
      introText: source.introText,
      paymentTemplateId: source.paymentTemplateId,
      paymentTermsOverride: source.paymentTermsOverride,
      tcTemplateId: source.tcTemplateId,
      tcOverride: source.tcOverride,
      confidentialWatermark: source.confidentialWatermark,
      hasBelowFloorPricing: source.hasBelowFloorPricing,
      internalNotes: source.internalNotes,
    },
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

  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } })
  if (!proposal) return { error: 'Proposal not found' }
  if (proposal.status !== 'PENDING_APPROVAL') return { error: 'Proposal is not pending approval' }
  if (proposal.assignedApproverId !== session.user.id && session.user.role !== 'SUPER_ADMIN') {
    return { error: 'You are not the assigned approver' }
  }

  await prisma.proposal.update({ where: { id: proposalId }, data: { status: 'APPROVED' } })

  await prisma.approvalEvent.create({
    data: { proposalId, action: 'approved', actorId: session.user.id },
  })

  await createNotification(
    proposal.createdById,
    `${proposal.number} has been approved. You can now generate the PDF.`,
    `/proposals/${proposalId}`,
  )

  await logAudit('Proposal', proposalId, 'approved', session.user.id)
  revalidatePath(`/proposals/${proposalId}`)
  revalidatePath('/proposals')
  return { success: true }
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
    return { error: 'You are not the assigned approver' }
  }

  await prisma.proposal.update({ where: { id: proposalId }, data: { status: 'REVISION_REQUIRED' } })

  await prisma.approvalEvent.create({
    data: { proposalId, action: 'revision_requested', actorId: session.user.id, comment },
  })

  await createNotification(
    proposal.createdById,
    `Revision requested on ${proposal.number}: ${comment}`,
    `/proposals/${proposalId}`,
  )

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
    return { error: 'You are not the assigned approver' }
  }

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { status: 'LOST', lostReason: `Rejected internally: ${reason}` },
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

  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } })
  if (!proposal) return { error: 'Proposal not found' }
  if (proposal.status !== 'APPROVED') return { error: 'Only approved proposals can be marked as sent' }

  if (
    proposal.createdById !== session.user.id &&
    !can(session.user, 'edit:any_proposal')
  ) {
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

  if (
    proposal.createdById !== session.user.id &&
    !can(session.user, 'edit:any_proposal')
  ) {
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

  if (
    proposal.createdById !== session.user.id &&
    !can(session.user, 'edit:any_proposal')
  ) {
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
    include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!proposal) return { error: 'Proposal not found' }

  if (
    proposal.createdById !== session.user.id &&
    !can(session.user, 'edit:any_proposal')
  ) {
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
  if (!proposal.assignedApproverId) {
    return { error: 'An approver must be assigned before submitting' }
  }
  if (proposal.lineItems.length === 0) {
    return { error: 'At least one line item is required' }
  }
  if (!proposal.paymentTemplateId && !proposal.paymentTermsOverride) {
    return { error: 'Payment terms are required' }
  }
  if (!proposal.tcTemplateId && !proposal.tcOverride) {
    return { error: 'Terms & conditions are required' }
  }
  if (Number(proposal.total) <= 0) {
    return { error: 'Total must be greater than 0' }
  }
  if (proposal.validUntil <= proposal.date) {
    return { error: 'Valid until date must be after the proposal date' }
  }

  // Check below-floor pricing requires SALES_MANAGER approver
  if (proposal.hasBelowFloorPricing) {
    const approver = await prisma.user.findUnique({ where: { id: proposal.assignedApproverId } })
    if (approver && approver.role !== 'SALES_MANAGER' && approver.role !== 'SUPER_ADMIN') {
      return { error: 'Below-floor pricing detected. A Sales Manager must be assigned as approver.' }
    }
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
      status: 'PENDING_APPROVAL',
    },
  })

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { status: 'PENDING_APPROVAL', version: nextVersion },
  })

  await prisma.approvalEvent.create({
    data: { proposalId, action: 'submitted', actorId: session.user.id },
  })

  const approver = await prisma.user.findUnique({ where: { id: proposal.assignedApproverId } })
  if (approver) {
    await createNotification(
      approver.id,
      `${proposal.number} has been submitted for your approval by ${session.user.name}.`,
      `/proposals/${proposalId}`,
    )
  }

  await logAudit('Proposal', proposalId, 'submitted_for_approval', session.user.id)
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
  clientName: string
  contactName: string
  contactTitle: string
  projectTitle: string
  date: string
  validUntil: string
  assignedApproverId: string
  introText: string
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
    sortOrder: number
    serviceName: string
    serviceMinRate: number | null
  }[]
  currency: string
  discountType: 'percentage' | 'fixed' | null
  discountValue: number | null
  discountLabel: string
  vatEnabled: boolean
  vatRate: number
  pricingNotes: string
  paymentTemplateId: string
  paymentTermsOverride: string | null
  tcTemplateId: string
  tcOverride: string | null
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
    },
  })
  if (!proposal) return { error: 'Proposal not found' }

  // Permission check
  if (
    proposal.createdById !== session.user.id &&
    !can(session.user, 'edit:any_proposal')
  ) {
    return { error: 'Unauthorized' }
  }

  if (proposal.status !== 'DRAFT' && proposal.status !== 'REVISION_REQUIRED') {
    return { error: 'This proposal cannot be edited in its current status' }
  }

  const formData: ProposalFormDataExport = {
    clientName: proposal.clientName,
    contactName: proposal.contactName ?? '',
    contactTitle: proposal.contactTitle ?? '',
    projectTitle: proposal.projectTitle,
    date: proposal.date.toISOString().split('T')[0],
    validUntil: proposal.validUntil.toISOString().split('T')[0],
    assignedApproverId: proposal.assignedApproverId ?? '',
    introText: proposal.introText ?? '',
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
      sortOrder: li.sortOrder,
      serviceName: li.service?.name ?? '',
      serviceMinRate: li.service?.minRate != null ? Number(li.service.minRate) : null,
    })),
    currency: proposal.currency,
    discountType: proposal.discountType as 'percentage' | 'fixed' | null,
    discountValue: proposal.discountValue != null ? Number(proposal.discountValue) : null,
    discountLabel: '',
    vatEnabled: proposal.vatRate != null,
    vatRate: proposal.vatRate != null ? Number(proposal.vatRate) : 12,
    pricingNotes: proposal.pricingNotes ?? '',
    paymentTemplateId: proposal.paymentTemplateId ?? '',
    paymentTermsOverride: proposal.paymentTermsOverride,
    tcTemplateId: proposal.tcTemplateId ?? '',
    tcOverride: proposal.tcOverride,
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
  if (String(prev.proposal.tcOverride ?? '') !== String(current.proposal.tcOverride ?? '')) {
    changes.push('Terms & conditions overridden from template.')
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
      contactName: sp.contactName ? String(sp.contactName) : null,
      contactTitle: sp.contactTitle ? String(sp.contactTitle) : null,
      projectTitle: String(sp.projectTitle ?? ''),
      date: new Date(String(sp.date)),
      validUntil: new Date(String(sp.validUntil)),
      currency: String(sp.currency ?? 'PHP'),
      subtotal: new Prisma.Decimal(String(sp.subtotal ?? '0')),
      discountType: sp.discountType ? String(sp.discountType) : null,
      discountValue: sp.discountValue != null ? new Prisma.Decimal(String(sp.discountValue)) : null,
      vatRate: sp.vatRate != null ? new Prisma.Decimal(String(sp.vatRate)) : null,
      total: new Prisma.Decimal(String(sp.total ?? '0')),
      pricingNotes: sp.pricingNotes ? String(sp.pricingNotes) : null,
      introText: sp.introText ? String(sp.introText) : null,
      paymentTemplateId: sp.paymentTemplateId ? String(sp.paymentTemplateId) : null,
      paymentTermsOverride: sp.paymentTermsOverride ? String(sp.paymentTermsOverride) : null,
      tcTemplateId: sp.tcTemplateId ? String(sp.tcTemplateId) : null,
      tcOverride: sp.tcOverride ? String(sp.tcOverride) : null,
      confidentialWatermark: Boolean(sp.confidentialWatermark),
      hasBelowFloorPricing: Boolean(sp.hasBelowFloorPricing),
      internalNotes: sp.internalNotes ? String(sp.internalNotes) : null,
    },
  })

  // Replace line items with snapshot data
  await prisma.proposalLineItem.deleteMany({ where: { proposalId } })
  for (const li of snapshot.lineItems) {
    await prisma.proposalLineItem.create({
      data: {
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
        sortOrder: Number(li.sortOrder ?? 0),
      },
    })
  }

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
