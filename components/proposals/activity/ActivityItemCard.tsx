'use client'

import { useState, useTransition } from 'react'
import {
  CalendarDays,
  CheckSquare,
  Download,
  Link2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  StickyNote,
  Trash2,
  UserRound,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { sanitizeHtml } from '@/lib/sanitize'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RichTextEditor } from '@/components/ui/rich-text-editor-lazy'
import type { ActivityUser, ProposalActivityItem } from '@/lib/activity-shared'
import {
  deleteActivity,
  getActivityFileUrl,
  toggleTaskComplete,
  updateActivity,
} from '@/lib/actions/activity'
import { isRichTextEmpty } from '@/lib/validations/activity'
import {
  fmtDateTime,
  fmtDueDate,
  formatFileSize,
  getInitials,
  isTaskOverdue,
  timeAgo,
} from './helpers'

const TYPE_META: Record<
  ProposalActivityItem['type'],
  { label: string; badge: string; dot: string; icon: typeof StickyNote }
> = {
  TASK: { label: 'Task', badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-400', icon: CheckSquare },
  NOTE: { label: 'Note', badge: 'bg-sky-50 text-sky-700', dot: 'bg-sky-400', icon: StickyNote },
  FILE: { label: 'File', badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400', icon: Paperclip },
  LINK: { label: 'Link', badge: 'bg-violet-50 text-violet-700', dot: 'bg-violet-400', icon: Link2 },
}

type Props = {
  item: ProposalActivityItem
  currentUser: { id: string; role: string }
  assignableUsers: ActivityUser[]
}

export function ActivityItemCard({ item, currentUser, assignableUsers }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Edit-mode fields, seeded from the item when editing starts
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [editAssigneeId, setEditAssigneeId] = useState('_none')
  const [editUrl, setEditUrl] = useState('')

  const meta = TYPE_META[item.type]
  const TypeIcon = meta.icon
  const isOwner = item.createdBy.id === currentUser.id
  const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN'
  const canEditItem = isOwner && item.type !== 'FILE'
  const canDeleteItem = isOwner || isAdmin
  const overdue = isTaskOverdue(item)
  const completed = item.completedAt !== null

  function fail(message: string) {
    toast({ title: message, variant: 'destructive' })
  }

  function startEditing() {
    setEditTitle(item.title ?? '')
    setEditBody(item.body ?? '')
    setEditDueDate(item.dueDate ? item.dueDate.slice(0, 10) : '')
    setEditAssigneeId(item.assignee?.id ?? '_none')
    setEditUrl(item.url ?? '')
    setIsEditing(true)
  }

  function handleToggleComplete() {
    startTransition(async () => {
      const result = await toggleTaskComplete(item.id)
      if ('error' in result) fail(result.error)
    })
  }

  function handleSaveEdit() {
    if (item.type === 'TASK' && !editTitle.trim()) {
      fail('Task title is required')
      return
    }
    if (item.type === 'NOTE' && isRichTextEmpty(editBody)) {
      fail('Note cannot be empty')
      return
    }
    if (item.type === 'LINK' && !editUrl.trim()) {
      fail('Enter a URL')
      return
    }
    startTransition(async () => {
      const result = await updateActivity({
        activityId: item.id,
        ...(item.type === 'TASK'
          ? {
              title: editTitle,
              body: editBody,
              dueDate: editDueDate,
              assigneeId: editAssigneeId === '_none' ? '' : editAssigneeId,
            }
          : {}),
        ...(item.type === 'NOTE' ? { body: editBody } : {}),
        ...(item.type === 'LINK'
          ? { url: editUrl.trim(), title: editTitle, body: editBody }
          : {}),
      })
      if ('error' in result) {
        fail(result.error)
        return
      }
      setIsEditing(false)
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteActivity(item.id)
      if ('error' in result) {
        fail(result.error)
        return
      }
      setConfirmDelete(false)
      toast({ title: 'Item deleted' })
    })
  }

  function handleDownload() {
    startTransition(async () => {
      const result = await getActivityFileUrl(item.id)
      if ('error' in result) {
        fail(result.error)
        return
      }
      // The signed URL carries a Content-Disposition: attachment with the
      // original file name, so navigating it triggers a download.
      const anchor = document.createElement('a')
      anchor.href = result.url
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    })
  }

  const linkHostname = (() => {
    if (!item.url) return null
    try {
      return new URL(item.url).hostname
    } catch {
      return item.url
    }
  })()

  return (
    <div className="relative mb-4 last:mb-0">
      <div
        className={cn(
          'absolute -left-3 top-1 w-2 h-2 rounded-full border-2 border-white',
          meta.dot,
        )}
      />
      <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
        {/* Header: author, type badge, timestamp, actions */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-6 w-6">
              {item.createdBy.avatarUrl && (
                <AvatarImage src={item.createdBy.avatarUrl} alt="" />
              )}
              <AvatarFallback className="text-[10px] bg-slate-100 text-slate-600">
                {getInitials(item.createdBy.name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-slate-800 truncate">
              {item.createdBy.name}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                meta.badge,
              )}
            >
              <TypeIcon className="h-3 w-3" />
              {meta.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className="text-xs text-slate-400 cursor-default"
              title={fmtDateTime(item.createdAt)}
            >
              {timeAgo(item.createdAt)}
            </span>
            {(canEditItem || canDeleteItem) && !isEditing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Item actions"
                    className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEditItem && (
                    <DropdownMenuItem onClick={startEditing}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDeleteItem && (
                    <DropdownMenuItem
                      onClick={() => setConfirmDelete(true)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Body */}
        {isEditing ? (
          <div className="mt-3 flex flex-col gap-3">
            {item.type === 'TASK' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`edit-title-${item.id}`}>Task title *</Label>
                  <Input
                    id={`edit-title-${item.id}`}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    maxLength={200}
                    disabled={isPending}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`edit-desc-${item.id}`}>Description</Label>
                  <Textarea
                    id={`edit-desc-${item.id}`}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={2}
                    disabled={isPending}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`edit-due-${item.id}`}>Due date</Label>
                    <Input
                      id={`edit-due-${item.id}`}
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`edit-assignee-${item.id}`}>Assignee</Label>
                    <Select
                      value={editAssigneeId}
                      onValueChange={setEditAssigneeId}
                      disabled={isPending}
                    >
                      <SelectTrigger id={`edit-assignee-${item.id}`}>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Unassigned</SelectItem>
                        {assignableUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
            {item.type === 'NOTE' && (
              <RichTextEditor value={editBody} onChange={setEditBody} disabled={isPending} />
            )}
            {item.type === 'LINK' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`edit-url-${item.id}`}>URL *</Label>
                  <Input
                    id={`edit-url-${item.id}`}
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    maxLength={2048}
                    disabled={isPending}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`edit-label-${item.id}`}>Label</Label>
                    <Input
                      id={`edit-label-${item.id}`}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      maxLength={200}
                      disabled={isPending}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`edit-comment-${item.id}`}>Comment</Label>
                    <Input
                      id={`edit-comment-${item.id}`}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      maxLength={2000}
                      disabled={isPending}
                    />
                  </div>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={isPending}>
                {isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {item.type === 'TASK' && (
              <div className="mt-2 flex items-start gap-2.5">
                <Checkbox
                  checked={completed}
                  onCheckedChange={handleToggleComplete}
                  disabled={isPending}
                  aria-label={completed ? 'Reopen task' : 'Mark task complete'}
                  className="mt-0.5"
                />
                <div className="flex flex-col gap-1 min-w-0">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      completed ? 'line-through text-slate-400' : 'text-slate-800',
                    )}
                  >
                    {item.title}
                  </span>
                  {item.body && (
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{item.body}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {item.dueDate && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                          overdue
                            ? 'bg-red-50 text-red-700'
                            : 'bg-slate-50 text-slate-600',
                        )}
                      >
                        <CalendarDays className="h-3 w-3" />
                        {overdue
                          ? `Overdue — due ${fmtDueDate(item.dueDate)}`
                          : `Due ${fmtDueDate(item.dueDate)}`}
                      </span>
                    )}
                    {item.assignee && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                        <UserRound className="h-3 w-3" />
                        {item.assignee.name}
                      </span>
                    )}
                  </div>
                  {completed && item.completedBy && (
                    <p className="text-xs text-slate-400">
                      Completed by {item.completedBy.name}
                      {item.completedAt ? ` · ${fmtDateTime(item.completedAt)}` : ''}
                    </p>
                  )}
                </div>
              </div>
            )}

            {item.type === 'NOTE' && item.body && (
              <div
                className="mt-2 prose prose-sm max-w-none text-slate-700 [&_p]:my-1"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.body) }}
              />
            )}

            {item.type === 'FILE' && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-700 truncate">{item.fileName}</span>
                  {item.fileSize != null && (
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {formatFileSize(item.fileSize)}
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={isPending}
                  className="flex-shrink-0"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  {isPending ? 'Preparing…' : 'Download'}
                </Button>
              </div>
            )}

            {item.type === 'LINK' && item.url && (
              <div className="mt-2 flex flex-col gap-1">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-accent)] hover:underline w-fit break-all"
                >
                  <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
                  {item.title || linkHostname}
                </a>
                {item.body && <p className="text-sm text-slate-600">{item.body}</p>}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this item?"
        description={
          item.type === 'FILE'
            ? 'The attachment will be removed from the feed and its file deleted from storage. This cannot be undone.'
            : 'This will be permanently removed from the activity feed. This cannot be undone.'
        }
        confirmLabel="Delete"
        destructive
        isPending={isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
