import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { TopHeader } from './TopHeader'
import { Toaster } from '@/components/ui/toaster'
import type { UserModel } from '@/lib/generated/prisma/models/User'

type Props = {
  user: UserModel
  unreadCount: number
  agencyName: string
  agencyLogoUrl: string | null
  children: React.ReactNode
}

export function AppShell({
  user,
  unreadCount,
  agencyName,
  agencyLogoUrl,
  children,
}: Props) {
  return (
    <div className="flex min-h-screen bg-[var(--color-surface)]">
      {/* Desktop sidebar */}
      <Sidebar user={user} agencyName={agencyName} agencyLogoUrl={agencyLogoUrl} unreadCount={unreadCount} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader user={user} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav user={user} />

      {/* Toast notifications */}
      <Toaster />
    </div>
  )
}
