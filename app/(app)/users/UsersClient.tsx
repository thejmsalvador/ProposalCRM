'use client'

import { useState, useTransition, useMemo } from 'react'
import { Search, UserPlus, Users } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toggleUserActive } from '@/lib/actions/users'
import type { UserListItem, TeamListItem } from '@/lib/actions/users'
import { InviteUserDialog } from './InviteUserDialog'
import { EditUserSheet } from './EditUserSheet'
import { TeamsSection } from './TeamsSection'

const ROLE_LABEL: Record<string, string> = {
  SALES_EXEC: 'Sales Exec',
  SALES_MANAGER: 'Sales Manager',
  COO: 'COO',
  CEO: 'CEO',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
}

const ROLE_BADGE: Record<string, string> = {
  SALES_EXEC: 'bg-slate-100 text-slate-600',
  SALES_MANAGER: 'bg-blue-100 text-blue-700',
  COO: 'bg-teal-100 text-teal-700',
  CEO: 'bg-amber-100 text-amber-700',
  ADMIN: 'bg-purple-100 text-purple-700',
  SUPER_ADMIN: 'bg-indigo-100 text-indigo-700',
}

type Props = {
  users: UserListItem[]
  teams: TeamListItem[]
  currentUserId: string
  canManageUsers: boolean
  canDeleteUsers: boolean
}

function StatusBadge({ user }: { user: UserListItem }) {
  if (user.deletedAt) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        Deleted
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        user.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {user.isActive ? 'Active' : 'Inactive'}
    </span>
  )
}

export function UsersClient({
  users,
  teams,
  currentUserId,
  canManageUsers,
  canDeleteUsers,
}: Props) {
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const activeCount = useMemo(() => users.filter((u) => !u.deletedAt).length, [users])
  const deletedCount = useMemo(() => users.filter((u) => u.deletedAt).length, [users])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter((u) => {
      if (u.deletedAt && !showDeleted) return false
      if (!q) return true
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    })
  }, [users, search, showDeleted])

  const managers = users.filter((u) => u.role === 'SALES_MANAGER' && !u.deletedAt)

  // Anyone who can manage OR delete users can open the account sheet (COO/CEO
  // get a read-only view whose only action is Delete).
  const canOpenSheet = canManageUsers || canDeleteUsers

  function handleToggleActive(user: UserListItem) {
    setTogglingId(user.id)
    startTransition(async () => {
      const result = await toggleUserActive(user.id, user.isActive)
      setTogglingId(null)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        const action = user.isActive ? 'deactivated' : 'reactivated'
        toast({ title: `User ${action}`, description: `${user.name} has been ${action}.` })
      }
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            User Management
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeCount} {activeCount === 1 ? 'member' : 'members'} in your organisation
          </p>
        </div>
        {canManageUsers && (
          <Button
            type="button"
            className="gap-2 min-h-[44px]"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus size={16} aria-hidden="true" />
            Invite user
          </Button>
        )}
      </div>

      {/* Search + deleted toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm w-full">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
            aria-hidden="true"
          />
          <Input
            id="user-search"
            type="search"
            placeholder="Search by name or email…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search users"
          />
        </div>
        {deletedCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-[var(--color-muted)] cursor-pointer select-none min-h-[44px]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            Show deleted ({deletedCount})
          </label>
        )}
      </div>

      {/* Users table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-[var(--color-border)] bg-white gap-3">
          <Users size={40} className="text-[var(--color-muted)]" aria-hidden="true" />
          <p className="text-sm text-[var(--color-muted)]">
            {search ? 'No users match your search.' : 'No users found. Invite your first team member.'}
          </p>
          {!search && canManageUsers && (
            <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
              Invite team member
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">
                    Team
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">
                    Last login
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.map((user) => (
                  <tr
                    key={user.id}
                    className={`hover:bg-[var(--color-surface)] transition-colors ${
                      user.deletedAt ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--color-primary)]">
                        {user.name}
                      </div>
                      <div className="text-xs text-[var(--color-muted)]">{user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[user.role] ?? 'bg-slate-100 text-slate-600'}`}
                      >
                        {ROLE_LABEL[user.role] ?? user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {user.teamName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge user={user} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {canManageUsers && !user.deletedAt && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={`min-h-[36px] ${
                              user.isActive
                                ? 'text-[var(--color-danger)] hover:bg-red-50'
                                : 'text-[var(--color-success)] hover:bg-green-50'
                            }`}
                            disabled={togglingId === user.id}
                            onClick={() => handleToggleActive(user)}
                          >
                            {togglingId === user.id
                              ? '…'
                              : user.isActive
                              ? 'Deactivate'
                              : 'Reactivate'}
                          </Button>
                        )}
                        {canOpenSheet && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-[36px]"
                            onClick={() => setEditingUser(user)}
                          >
                            {canManageUsers && !user.deletedAt ? 'Edit' : 'View'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-[var(--color-border)]">
            {filtered.map((user) => (
              <div
                key={user.id}
                className={`p-4 space-y-3 ${user.deletedAt ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--color-primary)]">{user.name}</p>
                    <p className="text-xs text-[var(--color-muted)]">{user.email}</p>
                  </div>
                  <span className="shrink-0">
                    <StatusBadge user={user} />
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--color-muted)]">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[user.role] ?? 'bg-slate-100 text-slate-600'}`}
                  >
                    {ROLE_LABEL[user.role] ?? user.role}
                  </span>
                  {user.teamName && <span>{user.teamName}</span>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {canManageUsers && !user.deletedAt && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`flex-1 min-h-[44px] ${
                        user.isActive
                          ? 'text-[var(--color-danger)] hover:bg-red-50'
                          : 'text-[var(--color-success)] hover:bg-green-50'
                      }`}
                      disabled={togglingId === user.id}
                      onClick={() => handleToggleActive(user)}
                    >
                      {togglingId === user.id
                        ? '…'
                        : user.isActive
                        ? 'Deactivate'
                        : 'Reactivate'}
                    </Button>
                  )}
                  {canOpenSheet && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[44px]"
                      onClick={() => setEditingUser(user)}
                    >
                      {canManageUsers && !user.deletedAt ? 'Edit' : 'View'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teams section */}
      {canManageUsers && <TeamsSection teams={teams} managers={managers} />}

      {/* Dialogs / sheets */}
      {canManageUsers && (
        <InviteUserDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          teams={teams}
        />
      )}
      {canOpenSheet && (
        <EditUserSheet
          user={editingUser}
          teams={teams}
          currentUserId={currentUserId}
          canManageUsers={canManageUsers}
          canDeleteUsers={canDeleteUsers}
          onClose={() => setEditingUser(null)}
        />
      )}
    </div>
  )
}
