// Bare layout for PDF pages — no sidebar, no nav, no app shell.
// Content is inserted directly into the root layout's <body>.
export default function PdfLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
