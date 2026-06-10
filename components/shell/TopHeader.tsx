'use client'

import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import Image from 'next/image'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/lib/actions/auth'
import type { UserModel } from '@/lib/generated/prisma/models/User'

// Derive a human-readable page title from the pathname
function pageTitleFromPath(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean)[0] ?? 'dashboard'
  const map: Record<string, string> = {
    dashboard: 'Dashboard',
    proposals: 'Proposals',
    clients: 'Clients',
    catalog: 'Service Catalog',
    'payment-terms': 'Payment Terms',
    'tc-templates': 'Terms & Conditions',
    users: 'Users',
    settings: 'Settings',
    notifications: 'Notifications',
  }
  return map[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1)
}

type Props = {
  user: UserModel
}

export function TopHeader({ user }: Props) {
  const pathname = usePathname()
  const pageTitle = pageTitleFromPath(pathname)

  return (
    <header className="h-14 flex items-center justify-between px-4 lg:px-6 bg-white border-b border-[var(--color-border)] shrink-0">
      <h1 className="text-base font-semibold text-[var(--color-primary)]">{pageTitle}</h1>

      <div className="flex items-center gap-1">
        {/* User avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="w-8 h-8 ml-1 rounded-full bg-[var(--color-accent)] text-white text-sm font-semibold flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-[var(--color-accent)] hover:ring-offset-2 transition-all"
              aria-label="User menu"
            >
              {user.avatarUrl ? (
                <Image
                  src={user.avatarUrl}
                  alt={user.name}
                  width={32}
                  height={32}
                  className="object-cover w-full h-full"
                />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" sideOffset={8} className="w-48">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-[var(--color-primary)] truncate">
                  {user.name}
                </span>
                <span className="text-xs text-[var(--color-muted)] truncate">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-red-600 focus:text-red-600 flex items-center gap-2"
              onSelect={() => signOut()}
            >
              <LogOut size={14} />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
