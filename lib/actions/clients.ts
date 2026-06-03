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
  industry: string | null
  primaryContact: { contactName: string | null; contactTitle: string | null } | null
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const clientSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
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
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().optional(),
})

// ─── createClient ─────────────────────────────────────────────────────────────

export async function createClient(
  data: unknown,
): Promise<{ success: true; id: string } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = clientSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const { companyName, industry, website, address, notes } = parsed.data

  const existing = await prisma.client.findFirst({
    where: { companyName: { equals: companyName.trim(), mode: 'insensitive' } },
  })
  if (existing) return { error: `A client named "${existing.companyName}" already exists` }

  const client = await prisma.client.create({
    data: {
      companyName: companyName.trim(),
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

  const { companyName, industry, website, address, notes } = parsed.data

  await prisma.client.update({
    where: { id },
    data: {
      companyName: companyName.trim(),
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

  const { contactName, contactTitle, email, phone, isPrimary, notes } = parsed.data

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
      email: email || null,
      phone: phone || null,
      isPrimary,
      notes: notes || null,
      createdById: session.user.id,
    },
  })

  revalidatePath(`/clients/${clientId}`)
  return { success: true, id: contact.id }
}

// ─── updateContact ────────────────────────────────────────────────────────────

export async function updateContact(
  id: string,
  data: unknown,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = contactSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const existing = await prisma.clientContact.findUnique({ where: { id } })
  if (!existing) return { error: 'Contact not found' }

  const { contactName, contactTitle, email, phone, isPrimary, notes } = parsed.data

  if (isPrimary) {
    await prisma.clientContact.updateMany({
      where: { clientId: existing.clientId, isPrimary: true, id: { not: id } },
      data: { isPrimary: false },
    })
  }

  await prisma.clientContact.update({
    where: { id },
    data: {
      contactName: contactName.trim(),
      contactTitle: contactTitle || null,
      email: email || null,
      phone: phone || null,
      isPrimary,
      notes: notes || null,
    },
  })

  revalidatePath(`/clients/${existing.clientId}`)
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

  await prisma.clientContact.delete({ where: { id } })

  revalidatePath(`/clients/${existing.clientId}`)
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
        where: { isPrimary: true },
        take: 1,
        select: { contactName: true, contactTitle: true },
      },
    },
    orderBy: { companyName: 'asc' },
    take: 10,
  })

  return clients.map((c) => ({
    id: c.id,
    companyName: c.companyName,
    industry: c.industry,
    primaryContact: c.contacts[0]
      ? { contactName: c.contacts[0].contactName, contactTitle: c.contacts[0].contactTitle }
      : null,
  }))
}

// ─── upsertClientFromProposal (called during proposal save) ──────────────────
// Returns the clientId — either the found/created Client's id, or null.

export async function upsertClientFromProposal(
  companyName: string,
  createdById: string,
): Promise<string | null> {
  if (!companyName.trim()) return null

  const existing = await prisma.client.findFirst({
    where: { companyName: { equals: companyName.trim(), mode: 'insensitive' } },
  })

  if (existing) return existing.id

  const client = await prisma.client.create({
    data: {
      companyName: companyName.trim(),
      createdById,
    },
  })

  return client.id
}
