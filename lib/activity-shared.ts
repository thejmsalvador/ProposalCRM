import type { Prisma } from './generated/prisma/client'

/**
 * Shared shapes for proposal activity-feed items (tasks, notes, files, links).
 * Kept in a plain (non-'use server') module so the relation include, the
 * serializer, and the DTO types can be reused by both `lib/actions/activity.ts`
 * and `getProposalDetail` in `lib/actions/proposals.ts` — 'use server' files
 * may only export async functions. Only type imports touch the Prisma client,
 * so the module is also safe to import from client components for its types.
 */

export const activityInclude = {
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  completedBy: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.ProposalActivityInclude

export type ActivityUser = { id: string; name: string; avatarUrl: string | null }

// Serialized feed item (all dates as ISO strings — crosses the RSC boundary).
// storagePath is deliberately omitted: downloads go through getActivityFileUrl
// by id, so object keys never reach the browser.
export type ProposalActivityItem = {
  id: string
  type: 'TASK' | 'NOTE' | 'FILE' | 'LINK'
  title: string | null
  body: string | null
  dueDate: string | null
  assignee: ActivityUser | null
  completedAt: string | null
  completedBy: ActivityUser | null
  url: string | null
  fileName: string | null
  fileSize: number | null
  mimeType: string | null
  createdBy: ActivityUser
  createdAt: string
  updatedAt: string
}

type ActivityRow = Prisma.ProposalActivityGetPayload<{ include: typeof activityInclude }>

export function serializeActivity(row: ActivityRow): ProposalActivityItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    assignee: row.assignee,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    completedBy: row.completedBy,
    url: row.url,
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
