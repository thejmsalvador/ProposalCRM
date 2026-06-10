'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Plus,
  Users,
  Package,
  CreditCard,
  ScrollText,
  UserCog,
  Settings,
  Bell,
  LogOut,
} from 'lucide-react'
import { signOut } from '@/lib/actions/auth'
import { cn } from '@/lib/utils'
import type { UserModel } from '@/lib/generated/prisma/models/User'
import { Role } from '@/lib/generated/prisma/enums'

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
  roles?: Role[]
  variant?: 'default' | 'cta'
  badge?: number
}

function getNavItems(unreadCount: number): NavItem[] {
  return [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Proposals', href: '/proposals', icon: FileText },
    { label: 'New Proposal', href: '/proposals/new', icon: Plus, variant: 'cta' },
    { label: 'Clients', href: '/clients', icon: Users },
    {
      label: 'Notifications',
      href: '/notifications',
      icon: Bell,
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
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
      href: '/tc-templates',
      icon: ScrollText,
      roles: [Role.ADMIN, Role.SUPER_ADMIN],
    },
    {
      label: 'Users',
      href: '/users',
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
}

const ROLE_LABEL: Record<Role, string> = {
  [Role.SALES_EXEC]: 'Sales Executive',
  [Role.SALES_MANAGER]: 'Sales Manager',
  [Role.ADMIN]: 'Admin',
  [Role.SUPER_ADMIN]: 'Super Admin',
}

type Props = {
  user: UserModel
  agencyName: string
  agencyLogoUrl: string | null
  unreadCount: number
}

export function Sidebar({ user, agencyName, agencyLogoUrl, unreadCount }: Props) {
  const pathname = usePathname()

  const visibleItems = getNavItems(unreadCount).filter(
    (item) => !item.roles || item.roles.includes(user.role as Role),
  )

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 bg-white border-r border-[var(--color-border)] shrink-0">
      {/* Agency logo / name */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--color-border)]">
        <Image
          src={agencyLogoUrl ?? '/sunday-studio-logo.svg'}
          alt={agencyName}
          width={32}
          height={32}
          className="rounded object-contain"
        />
        <span className="font-semibold text-[var(--color-primary)] text-sm truncate">
          {agencyName}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)

          if (item.variant === 'cta') {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 my-1 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <Icon size={16} />
                {item.label}
              </Link>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium pl-[10px]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-primary)]',
              )}
            >
              <Icon size={16} />
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && (
                <span className="min-w-[20px] h-5 px-1 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User profile at bottom */}
      <div className="px-4 py-4 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          {user.role === Role.SUPER_ADMIN ? (
            <Link
              href="/settings"
              className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white text-sm font-semibold shrink-0 overflow-hidden hover:ring-2 hover:ring-[var(--color-accent)] hover:ring-offset-2 transition-all"
              aria-label="Go to settings"
            >
              {user.avatarUrl ? (
                <Image
                  src={user.avatarUrl}
                  alt={user.name}
                  width={32}
                  height={32}
                  className="rounded-full object-cover w-full h-full"
                />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </Link>
          ) : (
            <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white text-sm font-semibold shrink-0 overflow-hidden">
              {user.avatarUrl ? (
                <Image
                  src={user.avatarUrl}
                  alt={user.name}
                  width={32}
                  height={32}
                  className="rounded-full object-cover w-full h-full"
                />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--color-primary)] truncate">{user.name}</p>
            <p className="text-xs text-[var(--color-muted)] truncate">
              {ROLE_LABEL[user.role as Role]}
            </p>
          </div>
          <button
            onClick={() => signOut()}
            aria-label="Sign out"
            className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
