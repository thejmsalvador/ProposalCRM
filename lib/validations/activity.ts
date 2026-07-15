import { z } from 'zod'

// ─── Attachment constraints ───────────────────────────────────────────────────

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25 MB

// extension → accepted browser-reported MIME types. Both the extension and the
// MIME type must match (extension is the real gate — the MIME value is
// client-supplied). `application/octet-stream` is accepted for any allowlisted
// extension because some browsers/OSes report it for Office/zip files.
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  csv: ['text/csv', 'application/vnd.ms-excel'],
  txt: ['text/plain'],
  zip: ['application/zip', 'application/x-zip-compressed'],
}

// Value for the file input's `accept` attribute, e.g. ".pdf,.png,…"
export const ATTACHMENT_ACCEPT = Object.keys(ALLOWED_ATTACHMENT_TYPES)
  .map((ext) => `.${ext}`)
  .join(',')

export function isAllowedAttachment(fileName: string, mimeType: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const allowed = ALLOWED_ATTACHMENT_TYPES[ext]
  if (!allowed) return false
  const mime = mimeType.toLowerCase()
  return allowed.includes(mime) || mime === 'application/octet-stream'
}

// Make a client-supplied file name safe to embed in a storage object key and a
// Content-Disposition header: keep only the basename, strip everything outside
// a conservative character set, and cap the length while preserving the
// extension (the extension is what the allowlist keys on).
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .replace(/[^\w.\- ()]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return 'file'
  if (cleaned.length <= 100) return cleaned
  const dot = cleaned.lastIndexOf('.')
  if (dot > 0 && cleaned.length - dot <= 10) {
    const ext = cleaned.slice(dot)
    return cleaned.slice(0, 100 - ext.length) + ext
  }
  return cleaned.slice(0, 100)
}

// Tiptap emits '<p></p>' for an empty document — strip tags to detect
// visually-empty rich text.
export function isRichTextEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === ''
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const dueDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid due date')

export const createTaskSchema = z.object({
  proposalId: z.string().min(1),
  title: z.string().min(1, 'Task title is required').max(200, 'Task title is too long'),
  body: z.string().max(5000, 'Description is too long').optional(),
  dueDate: dueDateString.optional().or(z.literal('')),
  assigneeId: z.string().optional().or(z.literal('')),
})

export const createNoteSchema = z.object({
  proposalId: z.string().min(1),
  body: z.string().min(1, 'Note cannot be empty').max(20000, 'Note is too long'),
})

export const createLinkSchema = z.object({
  proposalId: z.string().min(1),
  url: z
    .string()
    .max(2048, 'URL is too long')
    .url('Enter a valid URL (include https://)')
    .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) links are allowed'),
  title: z.string().max(200, 'Label is too long').optional(),
  body: z.string().max(2000, 'Comment is too long').optional(),
})

export const initFileUploadSchema = z.object({
  proposalId: z.string().min(1),
  fileName: z.string().min(1, 'File name is required').max(255, 'File name is too long'),
  fileSize: z
    .number()
    .int()
    .positive('File is empty')
    .max(MAX_ATTACHMENT_BYTES, 'File exceeds the 25 MB limit'),
  mimeType: z.string().min(1),
})

export const finalizeFileUploadSchema = z.object({
  proposalId: z.string().min(1),
  storagePath: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
})

// Shared by all editable types; the action whitelists fields per activity type.
export const updateActivitySchema = z.object({
  activityId: z.string().min(1),
  title: z.string().max(200, 'Title is too long').optional(),
  body: z.string().max(20000, 'Content is too long').optional(),
  dueDate: dueDateString.nullable().optional().or(z.literal('')),
  assigneeId: z.string().nullable().optional().or(z.literal('')),
  url: z
    .string()
    .max(2048, 'URL is too long')
    .url('Enter a valid URL (include https://)')
    .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) links are allowed')
    .optional(),
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type CreateNoteInput = z.infer<typeof createNoteSchema>
export type CreateLinkInput = z.infer<typeof createLinkSchema>
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>
