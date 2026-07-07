import DOMPurify from 'isomorphic-dompurify'

/**
 * Sanitize user-authored rich-text HTML (Tiptap output) before it is passed to
 * dangerouslySetInnerHTML. Uses an allow-list sanitizer that strips <script>,
 * event-handler attributes (onerror, onclick, …), javascript: URLs, and other
 * active content while keeping the formatting tags Tiptap emits.
 *
 * Works both on the server (PDF route, server components) and in the browser
 * (wizard previews, proposal detail) via isomorphic-dompurify.
 *
 * Pass null/undefined safely; returns '' for empty input.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    // Anchors are allowed but forced to open safely; DOMPurify already blocks
    // javascript:/data: URLs and event handlers.
    ADD_ATTR: ['target', 'rel'],
    USE_PROFILES: { html: true },
  })
}
