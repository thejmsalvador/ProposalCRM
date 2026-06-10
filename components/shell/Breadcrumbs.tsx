import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

type Crumb = {
  label: string
  href?: string
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] flex-wrap">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={12} aria-hidden="true" className="shrink-0" />}
            {item.href ? (
              <Link
                href={item.href}
                className="hover:text-[var(--color-accent)] hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-[var(--color-primary)] font-medium">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
