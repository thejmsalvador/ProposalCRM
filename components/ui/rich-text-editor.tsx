'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import { Bold, Italic, List, ListOrdered, Undo, Redo } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function RichTextEditor({ value, onChange, placeholder, className, disabled }: Props) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    editable: !disabled,
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChangeRef.current(editor.getHTML())
    },
  })

  // Sync editor content when the value prop changes externally (e.g. form reset)
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current !== value) {
      editor.commands.setContent(value || '')
    }
  }, [value, editor])

  // Sync editable state
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  if (!editor) return null

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-input bg-[var(--color-surface)]">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          aria-label="Bold"
          disabled={disabled}
        >
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          aria-label="Italic"
          disabled={disabled}
        >
          <Italic size={14} />
        </ToolbarButton>
        <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          aria-label="Bullet list"
          disabled={disabled}
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          aria-label="Ordered list"
          disabled={disabled}
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          aria-label="Undo"
          disabled={disabled || !editor.can().undo()}
        >
          <Undo size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          aria-label="Redo"
          disabled={disabled || !editor.can().redo()}
        >
          <Redo size={14} />
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className="px-3 py-2 min-h-[120px] focus:outline-none prose prose-sm max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[100px] [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0"
        data-placeholder={placeholder}
      />
    </div>
  )
}

function ToolbarButton({
  children,
  onClick,
  active,
  disabled,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
  'aria-label': string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'p-1.5 rounded transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center',
        active
          ? 'bg-[var(--color-accent)] text-white'
          : 'text-[var(--color-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-primary)]',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
      )}
    >
      {children}
    </button>
  )
}
