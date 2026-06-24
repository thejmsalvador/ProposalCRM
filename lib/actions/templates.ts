'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '../auth'
import { can } from '../permissions'
import { prisma } from '../prisma'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProposalTemplateOption = {
  id: string
  name: string
  isOrgWide: boolean
  createdById: string
  createdAt: string
  snapshotJson: {
    proposal: Record<string, unknown>
    lineItems: Record<string, unknown>[]
  }
}

// ─── Save as template ─────────────────────────────────────────────────────────

export async function saveAsTemplate(
  proposalId: string,
  name: string,
  isOrgWide: boolean,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  if (isOrgWide && !can(session.user, 'manage:templates')) {
    return { error: 'Only Admins can create org-wide templates' }
  }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!proposal) return { error: 'Proposal not found' }

  const snapshotJson = {
    proposal: {
      projectTitle: proposal.projectTitle,
      currency: proposal.currency,
      exchangeRate: proposal.exchangeRate != null ? String(proposal.exchangeRate) : null,
      discountType: proposal.discountType,
      discountValue: proposal.discountValue ? String(proposal.discountValue) : null,
      vatRate: proposal.vatRate ? String(proposal.vatRate) : null,
      pricingNotes: proposal.pricingNotes,
      paymentTemplateId: proposal.paymentTemplateId,
      paymentTermsOverride: proposal.paymentTermsOverride,
      tcTemplateId: proposal.tcTemplateId,
      tcOverride: proposal.tcOverride,
      tcSections: proposal.tcSections ?? [],
      confidentialWatermark: proposal.confidentialWatermark,
      assignedApproverId: proposal.assignedApproverId,
    },
    lineItems: proposal.lineItems.map((li) => ({
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
  }

  await prisma.proposalTemplate.create({
    data: {
      name: name.trim(),
      createdById: session.user.id,
      isOrgWide,
      snapshotJson,
    },
  })

  revalidatePath('/proposals')
  return { success: true }
}

// ─── Get templates for wizard ─────────────────────────────────────────────────

export async function getProposalTemplates(): Promise<ProposalTemplateOption[]> {
  const session = await getSession()
  if (!session) return []

  const templates = await prisma.proposalTemplate.findMany({
    where: {
      OR: [
        { createdById: session.user.id },
        { isOrgWide: true },
      ],
    },
    orderBy: [{ isOrgWide: 'desc' }, { name: 'asc' }],
  })

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    isOrgWide: t.isOrgWide,
    createdById: t.createdById,
    createdAt: t.createdAt.toISOString(),
    snapshotJson: t.snapshotJson as ProposalTemplateOption['snapshotJson'],
  }))
}

// ─── Delete template ──────────────────────────────────────────────────────────

export async function deleteProposalTemplate(
  templateId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const template = await prisma.proposalTemplate.findUnique({
    where: { id: templateId },
  })
  if (!template) return { error: 'Template not found' }

  if (
    template.createdById !== session.user.id &&
    !can(session.user, 'manage:templates')
  ) {
    return { error: 'Unauthorized' }
  }

  await prisma.proposalTemplate.delete({ where: { id: templateId } })
  revalidatePath('/proposals')
  return { success: true }
}
