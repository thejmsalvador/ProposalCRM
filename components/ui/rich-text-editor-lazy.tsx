'use client'

import dynamic from 'next/dynamic'

function RichTextEditorSkeleton() {
  return (
    <div
      className="rounded-md border border-input bg-background"
      aria-busy="true"
      aria-label="Loading editor"
    >
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-input bg-[var(--color-surface)]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-6 w-6 rounded bg-slate-200/70 animate-pulse" />
        ))}
      </div>
      <div className="min-h-[120px] p-3 flex flex-col gap-2">
        <div className="h-3 w-3/4 rounded bg-slate-100 animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-slate-100 animate-pulse" />
      </div>
    </div>
  )
}

/**
 * Lazy Tiptap editor — keeps ~150KB of editor code out of the initial bundle.
 * ssr:false is safe: the underlying editor uses immediatelyRender:false and
 * renders nothing until hydrated anyway.
 */
export const RichTextEditor = dynamic(
  () => import('./rich-text-editor').then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <RichTextEditorSkeleton /> },
)
