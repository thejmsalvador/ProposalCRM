'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientOption = {
  id: string
  companyName: string
  accountCode: string | null
  industry: string | null
  primaryContact: {
    contactName: string | null
    contactTitle: string | null
    department: string | null
    email: string | null
    phone: string | null
  } | null
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const clientSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  accountCode: z.string().trim().min(1, 'Account code is required'),
  industry: z.string().optional(),
  website: z
    .string()
    .url('Must be a valid URL (include https://)')
    .optional()
    .or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
})

const contactSchema = z.object({
  contactName: z.string().min(1, 'Contact name is required'),
  contactTitle: z.string().optional(),
  department: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().optional(),
})

// Contacts may exist without a company — clientId is optional
const standaloneContactSchema = contactSchema.extend({
  clientId: z.string().nullable().optional(),
})

// ─── createClient ─────────────────────────────────────────────────────────────

export async function createClient(
  data: unknown,
): Promise<{ success: true; id: string } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = clientSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const { companyName, accountCode, industry, website, address, notes } = parsed.data

  const existing = await prisma.client.findFirst({
    where: { companyName: { equals: companyName.trim(), mode: 'insensitive' } },
  })
  if (existing) return { error: `A client named "${existing.companyName}" already exists` }

  const client = await prisma.client.create({
    data: {
      companyName: companyName.trim(),
      accountCode: accountCode.trim().toUpperCase(),
      industry: industry || null,
      website: website || null,
      address: address || null,
      notes: notes || null,
      createdById: session.user.id,
    },
  })

  await logAudit('Client', client.id, 'created', session.user.id)
  revalidatePath('/clients')
  return { success: true, id: client.id }
}

// ─── updateClient ─────────────────────────────────────────────────────────────

export async function updateClient(
  id: string,
  data: unknown,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = clientSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const existing = await prisma.client.findUnique({ where: { id } })
  if (!existing) return { error: 'Client not found' }

  const { companyName, accountCode, industry, website, address, notes } = parsed.data

  await prisma.client.update({
    where: { id },
    data: {
      companyName: companyName.trim(),
      accountCode: accountCode.trim().toUpperCase(),
      industry: industry || null,
      website: website || null,
      address: address || null,
      notes: notes || null,
    },
  })

  await logAudit('Client', id, 'updated', session.user.id)
  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  return { success: true }
}

// ─── addContact ───────────────────────────────────────────────────────────────

export async function addContact(
  clientId: string,
  data: unknown,
): Promise<{ success: true; id: string } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = contactSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client) return { error: 'Client not found' }

  const { contactName, contactTitle, department, email, phone, isPrimary, notes } = parsed.data

  // Unset any existing primary contact first
  if (isPrimary) {
    await prisma.clientContact.updateMany({
      where: { clientId, isPrimary: true },
      data: { isPrimary: false },
    })
  }

  const contact = await prisma.clientContact.create({
    data: {
      clientId,
      contactName: contactName.trim(),
      contactTitle: contactTitle || null,
      department: department || null,
      email: email || null,
      phone: phone || null,
      isPrimary,
      notes: notes || null,
      createdById: session.user.id,
    },
  })

  await logAudit('ClientContact', contact.id, 'created', session.user.id)
  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
  return { success: true, id: contact.id }
}

// ─── createContact (standalone or company-linked, from the Contacts tab) ─────

export async function createContact(
  data: unknown,
): Promise<{ success: true; id: string } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = standaloneContactSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const { contactName, contactTitle, department, email, phone, isPrimary, notes } = parsed.data
  const clientId = parsed.data.clientId || null

  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client) return { error: 'Company not found' }
    if (isPrimary) {
      await prisma.clientContact.updateMany({
        where: { clientId, isPrimary: true },
        data: { isPrimary: false },
      })
    }
  }

  const contact = await prisma.clientContact.create({
    data: {
      clientId,
      contactName: contactName.trim(),
      contactTitle: contactTitle || null,
      department: department || null,
      email: email || null,
      phone: phone || null,
      // "Primary" only makes sense relative to a company
      isPrimary: clientId ? isPrimary : false,
      notes: notes || null,
      createdById: session.user.id,
    },
  })

  await logAudit('ClientContact', contact.id, 'created', session.user.id)
  revalidatePath('/clients')
  if (clientId) revalidatePath(`/clients/${clientId}`)
  return { success: true, id: contact.id }
}

// ─── updateContact ────────────────────────────────────────────────────────────

export async function updateContact(
  id: string,
  data: unknown,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = standaloneContactSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const existing = await prisma.clientContact.findUnique({ where: { id } })
  if (!existing) return { error: 'Contact not found' }

  const { contactName, contactTitle, department, email, phone, isPrimary, notes } = parsed.data
  // Keep the current company link unless the caller explicitly passes one
  const clientId =
    parsed.data.clientId === undefined ? existing.clientId : parsed.data.clientId || null

  if (clientId && clientId !== existing.clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client) return { error: 'Company not found' }
  }

  if (isPrimary && clientId) {
    await prisma.clientContact.updateMany({
      where: { clientId, isPrimary: true, id: { not: id } },
      data: { isPrimary: false },
    })
  }

  await prisma.clientContact.update({
    where: { id },
    data: {
      clientId,
      contactName: contactName.trim(),
      contactTitle: contactTitle || null,
      department: department || null,
      email: email || null,
      phone: phone || null,
      isPrimary: clientId ? isPrimary : false,
      notes: notes || null,
    },
  })

  await logAudit('ClientContact', id, 'updated', session.user.id)
  revalidatePath('/clients')
  if (existing.clientId) revalidatePath(`/clients/${existing.clientId}`)
  if (clientId && clientId !== existing.clientId) revalidatePath(`/clients/${clientId}`)
  return { success: true }
}

// ─── removeContact ────────────────────────────────────────────────────────────

export async function removeContact(
  id: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const existing = await prisma.clientContact.findUnique({ where: { id } })
  if (!existing) return { error: 'Contact not found' }

  // Soft-delete: archive instead of hard-deleting, consistent with the
  // archive-everywhere pattern used elsewhere, and audit the action.
  await prisma.clientContact.update({ where: { id }, data: { isArchived: true } })

  await logAudit('ClientContact', id, 'archived', session.user.id)
  revalidatePath('/clients')
  if (existing.clientId) revalidatePath(`/clients/${existing.clientId}`)
  return { success: true }
}

// ─── searchClients (for wizard combobox) ─────────────────────────────────────

export async function searchClients(query: string): Promise<ClientOption[]> {
  const session = await getSession()
  if (!session) return []

  const clients = await prisma.client.findMany({
    where: {
      companyName: { contains: query, mode: 'insensitive' },
    },
    include: {
      contacts: {
        where: { isPrimary: true, isArchived: false },
        take: 1,
        select: {
          contactName: true,
          contactTitle: true,
          department: true,
          email: true,
          phone: true,
        },
      },
    },
    orderBy: { companyName: 'asc' },
    take: 10,
  })

  return clients.map((c) => ({
    id: c.id,
    companyName: c.companyName,
    accountCode: c.accountCode,
    industry: c.industry,
    primaryContact: c.contacts[0]
      ? {
          contactName: c.contacts[0].contactName,
          contactTitle: c.contacts[0].contactTitle,
          department: c.contacts[0].department,
          email: c.contacts[0].email,
          phone: c.contacts[0].phone,
        }
      : null,
  }))
}

// ─── syncClientFromProposal (called during proposal save) ────────────────────
// Links the proposal to a Client record (creating one if needed) and upserts
// the contact person into that company's contact book.

type ProposalContactInfo = {
  contactName: string
  contactTitle: string
  department: string
  email: string
  phone: string
  /** Company-level business address — synced onto the Client record. */
  businessAddress: string
  /** Company-level account code — synced onto the Client record. */
  accountCode: string
}

export async function syncClientFromProposal(
  proposalId: string,
  clientId: string | null,
  companyName: string,
  contact: ProposalContactInfo,
  createdById: string,
): Promise<void> {
  let resolvedClientId = clientId

  // Find or create the company, then link the proposal to it
  if (!resolvedClientId && companyName.trim()) {
    const existing = await prisma.client.findFirst({
      where: { companyName: { equals: companyName.trim(), mode: 'insensitive' } },
    })
    resolvedClientId =
      existing?.id ??
      (
        await prisma.client.create({
          data: {
            companyName: companyName.trim(),
            createdById,
            address: contact.businessAddress.trim() || null,
            accountCode: contact.accountCode.trim().toUpperCase() || null,
          },
        })
      ).id

    await prisma.proposal
      .update({ where: { id: proposalId }, data: { clientId: resolvedClientId } })
      .catch(() => {/* non-critical */})
  }

  // Keep the company's business address and account code current when provided
  if (
    resolvedClientId &&
    (contact.businessAddress.trim() || contact.accountCode.trim())
  ) {
    await prisma.client
      .update({
        where: { id: resolvedClientId },
        data: {
          ...(contact.businessAddress.trim()
            ? { address: contact.businessAddress.trim() }
            : {}),
          ...(contact.accountCode.trim()
            ? { accountCode: contact.accountCode.trim().toUpperCase() }
            : {}),
        },
      })
      .catch(() => {/* non-critical */})
  }

  if (!resolvedClientId || !contact.contactName.trim()) return

  // Upsert the contact person on the company (matched by name)
  const name = contact.contactName.trim()
  const existingContact = await prisma.clientContact.findFirst({
    where: {
      clientId: resolvedClientId,
      contactName: { equals: name, mode: 'insensitive' },
      isArchived: false,
    },
  })

  if (existingContact) {
    await prisma.clientContact.update({
      where: { id: existingContact.id },
      data: {
        contactTitle: contact.contactTitle.trim() || existingContact.contactTitle,
        department: contact.department.trim() || existingContact.department,
        email: contact.email.trim() || existingContact.email,
        phone: contact.phone.trim() || existingContact.phone,
      },
    })
  } else {
    const hasPrimary = await prisma.clientContact.findFirst({
      where: { clientId: resolvedClientId, isPrimary: true, isArchived: false },
      select: { id: true },
    })
    await prisma.clientContact.create({
      data: {
        clientId: resolvedClientId,
        contactName: name,
        contactTitle: contact.contactTitle.trim() || null,
        department: contact.department.trim() || null,
        email: contact.email.trim() || null,
        phone: contact.phone.trim() || null,
        isPrimary: !hasPrimary,
        createdById,
      },
    })
  }
}
