'use client'

import { useRef, useState, useTransition } from 'react'
import { CheckSquare, Link2, Loader2, Paperclip, StickyNote, Upload, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
import { createSupabaseBrowserClient } from '@/lib/supabase'
import type { ActivityUser } from '@/lib/activity-shared'
import {
  createLink,
  createNote,
  createTask,
  finalizeActivityFileUpload,
  initActivityFileUpload,
} from '@/lib/actions/activity'
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  isAllowedAttachment,
  isRichTextEmpty,
} from '@/lib/validations/activity'
import { formatFileSize } from './helpers'

type ComposerMode = 'NOTE' | 'TASK' | 'FILE' | 'LINK'

const MODES: { key: ComposerMode; label: string; icon: typeof StickyNote }[] = [
  { key: 'NOTE', label: 'Note', icon: StickyNote },
  { key: 'TASK', label: 'Task', icon: CheckSquare },
  { key: 'FILE', label: 'File', icon: Paperclip },
  { key: 'LINK', label: 'Link', icon: Link2 },
]

type Props = {
  proposalId: string
  assignableUsers: ActivityUser[]
}

export function ActivityComposer({ proposalId, assignableUsers }: Props) {
  const [mode, setMode] = useState<ComposerMode>('NOTE')
  const [isPending, startTransition] = useTransition()

  // Note
  const [noteBody, setNoteBody] = useState('')
  // Task
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskAssigneeId, setTaskAssigneeId] = useState('_none')
  // Link
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [linkComment, setLinkComment] = useState('')
  // File
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const busy = isPending || isUploading

  function fail(message: string) {
    toast({ title: message, variant: 'destructive' })
  }

  function handlePostNote() {
    if (isRichTextEmpty(noteBody)) {
      fail('Note cannot be empty')
      return
    }
    startTransition(async () => {
      const result = await createNote({ proposalId, body: noteBody })
      if ('error' in result) {
        fail(result.error)
        return
      }
      setNoteBody('')
      toast({ title: 'Note added' })
    })
  }

  function handleAddTask() {
    if (!taskTitle.trim()) {
      fail('Task title is required')
      return
    }
    startTransition(async () => {
      const result = await createTask({
        proposalId,
        title: taskTitle,
        body: taskDescription || undefined,
        dueDate: taskDueDate,
        assigneeId: taskAssigneeId === '_none' ? '' : taskAssigneeId,
      })
      if ('error' in result) {
        fail(result.error)
        return
      }
      setTaskTitle('')
      setTaskDescription('')
      setTaskDueDate('')
      setTaskAssigneeId('_none')
      toast({ title: 'Task added' })
    })
  }

  function handleAddLink() {
    if (!linkUrl.trim()) {
      fail('Enter a URL')
      return
    }
    startTransition(async () => {
      const result = await createLink({
        proposalId,
        url: linkUrl.trim(),
        title: linkLabel || undefined,
        body: linkComment || undefined,
      })
      if ('error' in result) {
        fail(result.error)
        return
      }
      setLinkUrl('')
      setLinkLabel('')
      setLinkComment('')
      toast({ title: 'Link added' })
    })
  }

  function handleFileChosen(file: File | null) {
    if (!file) {
      setSelectedFile(null)
      return
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      fail('File exceeds the 25 MB limit')
      return
    }
    if (!isAllowedAttachment(file.name, file.type || 'application/octet-stream')) {
      fail('This file type is not allowed')
      return
    }
    setSelectedFile(file)
  }

  function clearSelectedFile() {
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Three-step upload: mint a signed upload token (server), push the bytes
  // browser → Supabase Storage directly (skips Vercel's ~4.5 MB body cap),
  // then finalize (server verifies the object and creates the feed row).
  async function handleUploadFile() {
    if (!selectedFile) return
    const mimeType = selectedFile.type || 'application/octet-stream'
    setIsUploading(true)
    try {
      const init = await initActivityFileUpload({
        proposalId,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        mimeType,
      })
      if ('error' in init) {
        fail(init.error)
        return
      }
      const supabase = createSupabaseBrowserClient()
      const { error: uploadError } = await supabase.storage
        .from(init.bucket)
        .uploadToSignedUrl(init.storagePath, init.token, selectedFile, {
          contentType: mimeType,
        })
      if (uploadError) {
        fail('Upload failed — please try again')
        return
      }
      const finalized = await finalizeActivityFileUpload({
        proposalId,
        storagePath: init.storagePath,
        fileName: selectedFile.name,
        mimeType,
      })
      if ('error' in finalized) {
        fail(finalized.error)
        return
      }
      clearSelectedFile()
      toast({ title: 'File attached' })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col gap-3">
      {/* Type switcher */}
      <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Post type">
        {MODES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            aria-pressed={mode === key}
            disabled={busy}
            className={cn(
              'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
              mode === key
                ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'NOTE' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            {/* Tiptap renders a contenteditable, not a labelable control */}
            <span className="text-sm font-medium leading-none">Note</span>
            <RichTextEditor
              value={noteBody}
              onChange={setNoteBody}
              placeholder="Share an update, meeting recap, or context for this proposal…"
              disabled={busy}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handlePostNote} disabled={busy} className="min-h-[44px]">
              {isPending ? 'Posting…' : 'Post note'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'TASK' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="composer-task-title">Task title *</Label>
            <Input
              id="composer-task-title"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Follow up with the client on pricing"
              maxLength={200}
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="composer-task-description">Description</Label>
            <Textarea
              id="composer-task-description"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Optional details…"
              rows={2}
              disabled={busy}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="composer-task-due">Due date</Label>
              <Input
                id="composer-task-due"
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="composer-task-assignee">Assignee</Label>
              <Select
                value={taskAssigneeId}
                onValueChange={setTaskAssigneeId}
                disabled={busy}
              >
                <SelectTrigger id="composer-task-assignee">
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
          <div className="flex justify-end">
            <Button onClick={handleAddTask} disabled={busy} className="min-h-[44px]">
              {isPending ? 'Adding…' : 'Add task'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'FILE' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="composer-file">Attachment</Label>
            <input
              ref={fileInputRef}
              id="composer-file"
              type="file"
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
            {selectedFile ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-700 truncate">{selectedFile.name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {formatFileSize(selectedFile.size)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearSelectedFile}
                  disabled={busy}
                  aria-label="Remove selected file"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="min-h-[44px] w-fit"
              >
                <Upload className="h-4 w-4 mr-2" />
                Choose file
              </Button>
            )}
            <p className="text-xs text-slate-400">
              PDF, images, Office documents, CSV, TXT or ZIP — up to 25 MB.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleUploadFile}
              disabled={busy || !selectedFile}
              className="min-h-[44px]"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading…
                </>
              ) : (
                'Upload file'
              )}
            </Button>
          </div>
        </div>
      )}

      {mode === 'LINK' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="composer-link-url">URL *</Label>
            <Input
              id="composer-link-url"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              maxLength={2048}
              disabled={busy}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="composer-link-label">Label</Label>
              <Input
                id="composer-link-label"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="e.g. Moodboard deck"
                maxLength={200}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="composer-link-comment">Comment</Label>
              <Input
                id="composer-link-comment"
                value={linkComment}
                onChange={(e) => setLinkComment(e.target.value)}
                placeholder="Optional context…"
                maxLength={2000}
                disabled={busy}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleAddLink} disabled={busy} className="min-h-[44px]">
              {isPending ? 'Adding…' : 'Add link'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
