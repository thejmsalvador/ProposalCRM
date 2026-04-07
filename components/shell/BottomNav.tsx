'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Plus,
  Users,
  Menu,
  Package,
  CreditCard,
  ScrollText,
  UserCog,
  Settings,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { UserModel } from '@/lib/generated/prisma/models/User'
import { Role } from '@/lib/generated/prisma/enums'

type OverflowItem = {
  label: string
  href: string
  icon: React.ElementType
  roles?: Role[]
}

const OVERFLOW_ITEMS: OverflowItem[] = [
  {
    label: 'Service Catalog',
    href: '/catalog',
    icon: Package,
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
  },
  {
    label: 'Payment Terms',
    href: '/payment-terms',
    icon: CreditCard,
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
  },
  {
    label: 'Terms & Conditions',
    href: '/terms',
    icon: ScrollText,
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
  },
  {
    label: 'Team',
    href: '/team',
    icon: UserCog,
    roles: [Role.SUPER_ADMIN],
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    roles: [Role.SUPER_ADMIN],
  },
]

type Props = { user: UserModel }

export function BottomNav({ user }: Props) {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)

  const visibleOverflow = OVERFLOW_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role as Role),
  )

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[var(--color-border)] flex items-center justify-around h-16 px-2">
        {/* Dashboard */}
        <Link
          href="/dashboard"
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs transition-colors',
            isActive('/dashboard')
              ? 'text-[var(--color-accent)]'
              : 'text-[var(--color-muted)]',
          )}
        >
          <LayoutDashboard size={20} />
          <span>Home</span>
        </Link>

        {/* Proposals */}
        <Link
          href="/proposals"
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs transition-colors',
            isActive('/proposals') && !isActive('/proposals/new')
              ? 'text-[var(--color-accent)]'
              : 'text-[var(--color-muted)]',
          )}
        >
          <FileText size={20} />
          <span>Proposals</span>
        </Link>

        {/* New Proposal — FAB style */}
        <Link
          href="/proposals/new"
          className="flex flex-col items-center gap-0.5"
        >
          <span className="w-12 h-12 -mt-6 rounded-full bg-[var(--color-accent)] flex items-center justify-center shadow-lg text-white hover:bg-indigo-700 transition-colors">
            <Plus size={22} />
          </span>
          <span className="text-xs text-[var(--color-muted)] mt-0.5">New</span>
        </Link>

        {/* Clients */}
        <Link
          href="/clients"
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs transition-colors',
            isActive('/clients')
              ? 'text-[var(--color-accent)]'
              : 'text-[var(--color-muted)]',
          )}
        >
          <Users size={20} />
          <span>Clients</span>
        </Link>

        {/* Menu — opens sheet for overflow items */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs text-[var(--color-muted)] transition-colors"
        >
          <Menu size={20} />
          <span>Menu</span>
        </button>
      </nav>

      {/* Overflow sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-auto rounded-t-2xl pb-safe">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-left text-base">More</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 py-2">
            {visibleOverflow.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)] px-2 py-3">
                No additional pages.
              </p>
            ) : (
              visibleOverflow.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors',
                      isActive(item.href)
                        ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium'
                        : 'text-[var(--color-primary)] hover:bg-[var(--color-surface)]',
                    )}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                )
              })
            )}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}
