export type KanbanColumnConfig = {
  status: string
  label: string
  colorClass: string
  headerBg: string
  dropAllowed: boolean
  allowedFrom?: string[]
  dropBlockedReason?: string
}

export const KANBAN_COLUMNS: KanbanColumnConfig[] = [
  {
    status: 'DRAFT',
    label: 'Draft',
    colorClass: 'border-t-slate-400',
    headerBg: 'bg-slate-50',
    dropAllowed: true,
  },
  {
    status: 'PENDING_APPROVAL',
    label: 'Pending Approval',
    colorClass: 'border-t-amber-400',
    headerBg: 'bg-amber-50',
    dropAllowed: false,
    dropBlockedReason:
      'Use "Submit for Approval" inside the proposal to move here.',
  },
  {
    status: 'REVISION_REQUIRED',
    label: 'Revision Required',
    colorClass: 'border-t-orange-400',
    headerBg: 'bg-orange-50',
    dropAllowed: false,
    dropBlockedReason: 'Only an approver can request revisions.',
  },
  {
    status: 'APPROVED',
    label: 'Approved',
    colorClass: 'border-t-indigo-400',
    headerBg: 'bg-indigo-50',
    dropAllowed: false,
    dropBlockedReason: 'Only an assigned approver can approve proposals.',
  },
  {
    status: 'SENT',
    label: 'Sent',
    colorClass: 'border-t-purple-400',
    headerBg: 'bg-purple-50',
    dropAllowed: true,
    allowedFrom: ['APPROVED'],
  },
  {
    status: 'WON',
    label: 'Won',
    colorClass: 'border-t-green-500',
    headerBg: 'bg-green-50',
    dropAllowed: true,
    allowedFrom: ['SENT'],
  },
  {
    status: 'LOST',
    label: 'Lost',
    colorClass: 'border-t-red-400',
    headerBg: 'bg-red-50',
    dropAllowed: true,
    allowedFrom: ['SENT', 'APPROVED', 'PENDING_APPROVAL'],
  },
  {
    status: 'ON_HOLD',
    label: 'On Hold',
    colorClass: 'border-t-slate-500',
    headerBg: 'bg-slate-100',
    dropAllowed: true,
    allowedFrom: ['DRAFT', 'SENT', 'APPROVED'],
  },
  {
    status: 'EXPIRED',
    label: 'Expired',
    colorClass: 'border-t-gray-300',
    headerBg: 'bg-gray-50',
    dropAllowed: false,
    dropBlockedReason:
      'Proposals expire automatically when their validity date passes.',
  },
]
