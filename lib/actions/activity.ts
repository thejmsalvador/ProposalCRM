'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canViewProposal } from '@/lib/proposal-visibility'
import { logAudit } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'
import { sendEmail, taskAssignedEmail } from '@/lib/email'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sanitizeHtml } from '@/lib/sanitize'
import {
  activityInclude,
  serializeActivity,
  type ActivityUser,
  type ProposalActivityItem,
} from '@/lib/activity-shared'
import type { Prisma } from '@/lib/generated/prisma/client'
import {
  MAX_ATTACHMENT_BYTES,
  createLinkSchema,
  createNoteSchema,
  createTaskSchema,
  finalizeFileUploadSchema,
  initFileUploadSchema,
  updateActivitySchema,
  isAllowedAttachment,
  isRichTextEmpty,
  sanitizeFileName,
} from '@/lib/validations/activity'

// Proposal collaboration feed: user-posted tasks, notes, file attachments and
// links. Access rule everywhere: anyone who can VIEW the proposal
// (canViewProposal) may read and post — the PENDING_APPROVAL edit-lock applies
// to proposal content, not to the feed. Edits are owner-only; deletes are
// owner or ADMIN/SUPER_ADMIN.

const BUCKET = process.env.STORAGE_BUCKET_NAME ?? 'proposals'

const feedLink = (proposalId: string) => `/proposals/${proposalId}?tab=activity`

type ScopedUser = { id: string; role: string; teamId: string | null }

type ScopedProposal = {
  id: string
  number: string
  createdById: string
  createdBy: { teamId: string | null }
}

// Loads the minimal proposal shape needed for visibility checks + notification
// copy. Returns null for both "missing" and "not visible" so callers surface a
// single undistinguishable 'Proposal not found' (mirrors the PDF route).
async function loadScopedProposal(
  proposalId: string,
  user: ScopedUser,
): Promise<ScopedProposal | null> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      number: true,
      createdById: true,
      createdBy: { select: { teamId: true } },
    },
  })
  if (!proposal || !canViewProposal(user, proposal)) return null
  return proposal
}

// In-app heads-up to the proposal owner when someone else posts to their feed.
async function notifyProposalCreator(
  proposal: ScopedProposal,
  actor: { id: string; name: string },
  message: string,
): Promise<void> {
  if (proposal.createdById === actor.id) return
  await createNotification(proposal.createdById, message, feedLink(proposal.id))
}

// Validates a task assignee: must exist, be active, and be able to view the
// proposal (otherwise the notification link would 404 for them).
async function resolveAssignee(
  assigneeId: string,
  proposal: ScopedProposal,
): Promise<{ id: string; name: string; email: string } | { error: string }> {
  const found = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { id: true, name: true, email: true, isActive: true, role: true, teamId: true },
  })
  if (!found || !found.isActive) return { error: 'Assignee not found or inactive' }
  if (!canViewProposal({ id: found.id, role: found.role, teamId: found.teamId }, proposal)) {
    return { error: 'That user cannot view this proposal, so they cannot be assigned' }
  }
  return { id: found.id, name: found.name, email: found.email }
}

async function notifyTaskAssigned(
  assignee: { id: string; name: string; email: string },
  actor: { id: string; name: string },
  taskTitle: string,
  dueDate: Date | null,
  proposal: ScopedProposal,
): Promise<void> {
  if (assignee.id === actor.id) return
  await createNotification(
    assignee.id,
    `${actor.name} assigned you a task on ${proposal.number}: ${taskTitle}`,
    feedLink(proposal.id),
  )
  const tpl = taskAssignedEmail({
    assigneeName: assignee.name,
    assignerName: actor.name,
    taskTitle,
    dueDate: dueDate ? fmtEmailDate(dueDate) : null,
    proposalNumber: proposal.number,
    proposalId: proposal.id,
  })
  await sendEmail(assignee.email, tpl.subject, tpl.html)
}

// Due dates are stored as UTC midnight (parsed from a YYYY-MM-DD input), so
// format in UTC — server-local formatting could shift the displayed day.
function fmtEmailDate(date: Date): string {
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

// Existence + true size of an uploaded object, used to verify the client's
// claims at finalize time. info() is the primary path; fall back to list() +
// object metadata if the endpoint/field is unavailable.
async function statStorageObject(
  storagePath: string,
): Promise<{ exists: boolean; size: number | null }> {
  const storage = getSupabaseAdmin().storage.from(BUCKET)
  try {
    const { data, error } = await storage.info(storagePath)
    if (!error && data) {
      return { exists: true, size: typeof data.size === 'number' ? data.size : null }
    }
  } catch {
    // fall through to list()
  }
  const slash = storagePath.lastIndexOf('/')
  const prefix = storagePath.slice(0, slash)
  const basename = storagePath.slice(slash + 1)
  try {
    const { data: items, error } = await storage.list(prefix, { limit: 2, search: basename })
    if (error || !items) return { exists: false, size: null }
    const match = items.find((item) => item.name === basename)
    if (!match) return { exists: false, size: null }
    const size = (match.metadata as { size?: number } | null)?.size
    return { exists: true, size: typeof size === 'number' ? size : null }
  } catch {
    return { exists: false, size: null }
  }
}

// ─── getAssignableUsers ───────────────────────────────────────────────────────

/**
 * Active users who may be assigned tasks on this proposal — i.e. those who can
 * view it (a SALES_EXEC from another team would 404 on the task link).
 * Intentionally returns only id/name/avatar, unlike the admin-only getUsers().
 */
export async function getAssignableUsers(proposalId: string): Promise<ActivityUser[]> {
  const session = await getSession()
  if (!session) return []

  const proposal = await loadScopedProposal(proposalId, session.user)
  if (!proposal) return []

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, avatarUrl: true, role: true, teamId: true },
    orderBy: { name: 'asc' },
  })
  return users
    .filter((u) => canViewProposal({ id: u.id, role: u.role, teamId: u.teamId }, proposal))
    .map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl }))
}

// ─── createTask ───────────────────────────────────────────────────────────────

export async function createTask(
  data: unknown,
): Promise<{ success: true; activity: ProposalActivityItem } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = createTaskSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const proposal = await loadScopedProposal(parsed.data.proposalId, session.user)
  if (!proposal) return { error: 'Proposal not found' }

  const title = parsed.data.title.trim()
  if (!title) return { error: 'Task title is required' }
  const dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null

  let assignee: { id: string; name: string; email: string } | null = null
  if (parsed.data.assigneeId) {
    const resolved = await resolveAssignee(parsed.data.assigneeId, proposal)
    if ('error' in resolved) return resolved
    assignee = resolved
  }

  const activity = await prisma.proposalActivity.create({
    data: {
      proposalId: proposal.id,
      type: 'TASK',
      title,
      body: parsed.data.body?.trim() || null,
      dueDate,
      assigneeId: assignee?.id ?? null,
      createdById: session.user.id,
    },
    include: activityInclude,
  })

  if (assignee) {
    await notifyTaskAssigned(assignee, session.user, title, dueDate, proposal)
  }

  await logAudit('ProposalActivity', activity.id, 'task_created', session.user.id, {
    proposalId: proposal.id,
    title,
  })
  revalidatePath(`/proposals/${proposal.id}`)
  return { success: true, activity: serializeActivity(activity) }
}

// ─── createNote ───────────────────────────────────────────────────────────────

export async function createNote(
  data: unknown,
): Promise<{ success: true; activity: ProposalActivityItem } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = createNoteSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const proposal = await loadScopedProposal(parsed.data.proposalId, session.user)
  if (!proposal) return { error: 'Proposal not found' }

  // Sanitize at write time (defense in depth — renderers sanitize again).
  const body = sanitizeHtml(parsed.data.body)
  if (isRichTextEmpty(body)) return { error: 'Note cannot be empty' }

  const activity = await prisma.proposalActivity.create({
    data: {
      proposalId: proposal.id,
      type: 'NOTE',
      body,
      createdById: session.user.id,
    },
    include: activityInclude,
  })

  await notifyProposalCreator(
    proposal,
    session.user,
    `${session.user.name} added a note on ${proposal.number}.`,
  )
  await logAudit('ProposalActivity', activity.id, 'note_created', session.user.id, {
    proposalId: proposal.id,
  })
  revalidatePath(`/proposals/${proposal.id}`)
  return { success: true, activity: serializeActivity(activity) }
}

// ─── createLink ───────────────────────────────────────────────────────────────

export async function createLink(
  data: unknown,
): Promise<{ success: true; activity: ProposalActivityItem } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = createLinkSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const proposal = await loadScopedProposal(parsed.data.proposalId, session.user)
  if (!proposal) return { error: 'Proposal not found' }

  const activity = await prisma.proposalActivity.create({
    data: {
      proposalId: proposal.id,
      type: 'LINK',
      url: parsed.data.url,
      title: parsed.data.title?.trim() || null,
      body: parsed.data.body?.trim() || null,
      createdById: session.user.id,
    },
    include: activityInclude,
  })

  await notifyProposalCreator(
    proposal,
    session.user,
    `${session.user.name} added a link on ${proposal.number}.`,
  )
  await logAudit('ProposalActivity', activity.id, 'link_created', session.user.id, {
    proposalId: proposal.id,
  })
  revalidatePath(`/proposals/${proposal.id}`)
  return { success: true, activity: serializeActivity(activity) }
}

// ─── File attachments ─────────────────────────────────────────────────────────
// Two-step flow so the file bytes go browser → Supabase Storage directly
// (Vercel caps request bodies at ~4.5 MB, so they can't pass through a server
// action): initActivityFileUpload validates and mints a signed upload token;
// the browser uploads with uploadToSignedUrl; finalizeActivityFileUpload
// verifies the object and creates the feed row.

export async function initActivityFileUpload(
  data: unknown,
): Promise<
  { success: true; storagePath: string; token: string; bucket: string } | { error: string }
> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = initFileUploadSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const proposal = await loadScopedProposal(parsed.data.proposalId, session.user)
  if (!proposal) return { error: 'Proposal not found' }

  if (!isAllowedAttachment(parsed.data.fileName, parsed.data.mimeType)) {
    return { error: 'This file type is not allowed' }
  }

  const storagePath = `proposals/${proposal.id}/attachments/${randomUUID()}-${sanitizeFileName(parsed.data.fileName)}`
  const { data: signed, error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUploadUrl(storagePath)
  if (error || !signed) {
    console.error('[activity] createSignedUploadUrl failed:', error)
    return { error: 'Could not start the upload — please try again' }
  }

  // The bucket name is returned because STORAGE_BUCKET_NAME is a server-only
  // env var and the browser needs it for uploadToSignedUrl.
  return { success: true, storagePath, token: signed.token, bucket: BUCKET }
}

export async function finalizeActivityFileUpload(
  data: unknown,
): Promise<{ success: true; activity: ProposalActivityItem } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = finalizeFileUploadSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const proposal = await loadScopedProposal(parsed.data.proposalId, session.user)
  if (!proposal) return { error: 'Proposal not found' }

  const { storagePath, mimeType } = parsed.data
  const fileName = sanitizeFileName(parsed.data.fileName)

  // The path must be one this proposal's init step could have minted — blocks
  // registering arbitrary objects (e.g. another proposal's PDF) as attachments.
  if (!storagePath.startsWith(`proposals/${proposal.id}/attachments/`)) {
    return { error: 'Invalid storage path' }
  }
  if (!isAllowedAttachment(fileName, mimeType)) {
    return { error: 'This file type is not allowed' }
  }

  const duplicate = await prisma.proposalActivity.findFirst({
    where: { storagePath },
    select: { id: true },
  })
  if (duplicate) return { error: 'This file is already attached' }

  const stat = await statStorageObject(storagePath)
  if (!stat.exists) return { error: 'Upload not found — please try uploading again' }
  if (stat.size !== null && stat.size > MAX_ATTACHMENT_BYTES) {
    // The client lied about the size at init time — remove the oversized object.
    try {
      await getSupabaseAdmin().storage.from(BUCKET).remove([storagePath])
    } catch (err) {
      console.error('[activity] failed to remove oversized upload:', err)
    }
    return { error: 'File exceeds the 25 MB limit' }
  }

  const activity = await prisma.proposalActivity.create({
    data: {
      proposalId: proposal.id,
      type: 'FILE',
      storagePath,
      fileName,
      fileSize: stat.size,
      mimeType,
      createdById: session.user.id,
    },
    include: activityInclude,
  })

  await notifyProposalCreator(
    proposal,
    session.user,
    `${session.user.name} attached a file on ${proposal.number}: ${fileName}`,
  )
  await logAudit('ProposalActivity', activity.id, 'file_added', session.user.id, {
    proposalId: proposal.id,
    fileName,
    fileSize: stat.size,
  })
  revalidatePath(`/proposals/${proposal.id}`)
  return { success: true, activity: serializeActivity(activity) }
}

/** Mints a short-lived (1h) signed download URL for a FILE activity. */
export async function getActivityFileUrl(
  activityId: string,
): Promise<{ success: true; url: string } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const activity = await prisma.proposalActivity.findUnique({
    where: { id: activityId },
    select: {
      type: true,
      storagePath: true,
      fileName: true,
      proposal: {
        select: { createdById: true, createdBy: { select: { teamId: true } } },
      },
    },
  })
  if (!activity || !canViewProposal(session.user, activity.proposal)) {
    return { error: 'Attachment not found' }
  }
  if (activity.type !== 'FILE' || !activity.storagePath) {
    return { error: 'This item is not a file attachment' }
  }

  const { data, error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(activity.storagePath, 3600, {
      download: activity.fileName ?? true,
    })
  if (error || !data?.signedUrl) {
    console.error('[activity] createSignedUrl failed:', error)
    return { error: 'Could not generate a download link — please try again' }
  }
  return { success: true, url: data.signedUrl }
}

// ─── toggleTaskComplete ───────────────────────────────────────────────────────

export async function toggleTaskComplete(
  activityId: string,
): Promise<{ success: true; activity: ProposalActivityItem } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const existing = await prisma.proposalActivity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      type: true,
      title: true,
      completedAt: true,
      createdById: true,
      proposal: {
        select: {
          id: true,
          number: true,
          createdById: true,
          createdBy: { select: { teamId: true } },
        },
      },
    },
  })
  if (!existing || !canViewProposal(session.user, existing.proposal)) {
    return { error: 'Task not found' }
  }
  if (existing.type !== 'TASK') return { error: 'Only tasks can be completed' }

  const completing = existing.completedAt === null
  const activity = await prisma.proposalActivity.update({
    where: { id: existing.id },
    data: completing
      ? { completedAt: new Date(), completedById: session.user.id }
      : { completedAt: null, completedById: null },
    include: activityInclude,
  })

  if (completing && existing.createdById !== session.user.id) {
    await createNotification(
      existing.createdById,
      `${session.user.name} completed a task on ${existing.proposal.number}: ${existing.title ?? 'Untitled task'}`,
      feedLink(existing.proposal.id),
    )
  }
  await logAudit(
    'ProposalActivity',
    existing.id,
    completing ? 'task_completed' : 'task_reopened',
    session.user.id,
    { proposalId: existing.proposal.id },
  )
  revalidatePath(`/proposals/${existing.proposal.id}`)
  return { success: true, activity: serializeActivity(activity) }
}

// ─── updateActivity ───────────────────────────────────────────────────────────

export async function updateActivity(
  data: unknown,
): Promise<{ success: true; activity: ProposalActivityItem } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const parsed = updateActivitySchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const existing = await prisma.proposalActivity.findUnique({
    where: { id: parsed.data.activityId },
    select: {
      id: true,
      type: true,
      assigneeId: true,
      createdById: true,
      proposal: {
        select: {
          id: true,
          number: true,
          createdById: true,
          createdBy: { select: { teamId: true } },
        },
      },
    },
  })
  if (!existing || !canViewProposal(session.user, existing.proposal)) {
    return { error: 'Item not found' }
  }
  if (existing.createdById !== session.user.id) {
    return { error: 'You can only edit your own items' }
  }
  if (existing.type === 'FILE') {
    return { error: 'File attachments cannot be edited — delete and re-upload instead' }
  }

  const { title, body, dueDate, assigneeId, url } = parsed.data
  const patch: Prisma.ProposalActivityUncheckedUpdateInput = {}
  let newAssignee: { id: string; name: string; email: string } | null = null
  let nextDueDate: Date | null = null

  if (existing.type === 'TASK') {
    if (title !== undefined) {
      const trimmed = title.trim()
      if (!trimmed) return { error: 'Task title is required' }
      patch.title = trimmed
    }
    if (body !== undefined) patch.body = body.trim() || null
    if (dueDate !== undefined) {
      nextDueDate = dueDate ? new Date(dueDate) : null
      patch.dueDate = nextDueDate
    }
    if (assigneeId !== undefined) {
      const nextAssigneeId = assigneeId || null
      if (nextAssigneeId && nextAssigneeId !== existing.assigneeId) {
        const resolved = await resolveAssignee(nextAssigneeId, existing.proposal)
        if ('error' in resolved) return resolved
        newAssignee = resolved
      }
      patch.assigneeId = nextAssigneeId
    }
  } else if (existing.type === 'NOTE') {
    if (body !== undefined) {
      const clean = sanitizeHtml(body)
      if (isRichTextEmpty(clean)) return { error: 'Note cannot be empty' }
      patch.body = clean
    }
  } else if (existing.type === 'LINK') {
    if (url !== undefined) patch.url = url
    if (title !== undefined) patch.title = title.trim() || null
    if (body !== undefined) patch.body = body.trim() || null
  }

  if (Object.keys(patch).length === 0) return { error: 'Nothing to update' }

  const activity = await prisma.proposalActivity.update({
    where: { id: existing.id },
    data: patch,
    include: activityInclude,
  })

  // Reassignment notifies the new assignee, same as initial assignment.
  if (newAssignee && activity.title) {
    await notifyTaskAssigned(
      newAssignee,
      session.user,
      activity.title,
      nextDueDate ?? activity.dueDate,
      existing.proposal,
    )
  }

  await logAudit('ProposalActivity', existing.id, 'activity_updated', session.user.id, {
    proposalId: existing.proposal.id,
    fields: Object.keys(patch),
  })
  revalidatePath(`/proposals/${existing.proposal.id}`)
  return { success: true, activity: serializeActivity(activity) }
}

// ─── deleteActivity ───────────────────────────────────────────────────────────

export async function deleteActivity(
  activityId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Unauthenticated' }

  const existing = await prisma.proposalActivity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      type: true,
      title: true,
      fileName: true,
      storagePath: true,
      createdById: true,
      proposal: {
        select: { id: true, createdById: true, createdBy: { select: { teamId: true } } },
      },
    },
  })
  if (!existing || !canViewProposal(session.user, existing.proposal)) {
    return { error: 'Item not found' }
  }
  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
  if (existing.createdById !== session.user.id && !isAdmin) {
    return { error: 'You can only delete your own items' }
  }

  // Best-effort storage cleanup — a failed removal must never block the delete
  // (the row is the source of truth; an orphaned object is harmless).
  if (existing.type === 'FILE' && existing.storagePath) {
    try {
      const { error } = await getSupabaseAdmin()
        .storage.from(BUCKET)
        .remove([existing.storagePath])
      if (error) console.error('[activity] failed to remove storage object:', error)
    } catch (err) {
      console.error('[activity] failed to remove storage object:', err)
    }
  }

  await prisma.proposalActivity.delete({ where: { id: existing.id } })
  await logAudit('ProposalActivity', existing.id, 'activity_deleted', session.user.id, {
    proposalId: existing.proposal.id,
    type: existing.type,
    title: existing.title,
    fileName: existing.fileName,
  })
  revalidatePath(`/proposals/${existing.proposal.id}`)
  return { success: true }
}
