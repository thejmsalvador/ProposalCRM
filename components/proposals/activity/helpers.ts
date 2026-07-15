// Shared display helpers for the proposal detail page and its activity feed.
// Moved out of ProposalDetailClient so the feed components and the detail page
// use a single definition.

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  REVISION_REQUIRED: 'Revision Required',
  APPROVED: 'Approved',
  SENT: 'Sent',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On Hold',
  EXPIRED: 'Expired',
}

export const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  REVISION_REQUIRED: 'bg-orange-100 text-orange-700',
  APPROVED: 'bg-indigo-100 text-indigo-700',
  SENT: 'bg-purple-100 text-purple-700',
  WON: 'bg-green-100 text-green-700',
  LOST: 'bg-red-100 text-red-700',
  ON_HOLD: 'bg-slate-200 text-slate-600',
  EXPIRED: 'bg-gray-100 text-gray-500',
}

export const APPROVAL_EVENT_LABELS: Record<string, string> = {
  submitted: 'Submitted for approval',
  coo_approved: 'Approved by COO',
  approved: 'Approved',
  revision_requested: 'Revision requested',
  rejected: 'Rejected',
  expired: 'Expired',
  won: 'Marked as Won',
  lost: 'Marked as Lost',
  sent: 'Marked as Sent',
  overridden: 'Status force-overridden',
  on_hold: 'Put on hold',
  reverted_to_draft: 'Reverted to draft',
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return fmtDate(iso)
}

// Due dates are date-only values stored as UTC midnight; format them in UTC so
// the displayed day never shifts with the viewer's timezone.
export function fmtDueDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function formatFileSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Overdue = has a due date in the past (date-only compare) and not completed. */
export function isTaskOverdue(item: { dueDate: string | null; completedAt: string | null }): boolean {
  if (!item.dueDate || item.completedAt) return false
  // en-CA formats as YYYY-MM-DD; compare date strings to avoid TZ off-by-one.
  const today = new Date().toLocaleDateString('en-CA')
  return item.dueDate.slice(0, 10) < today
}
