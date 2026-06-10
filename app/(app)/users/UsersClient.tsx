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
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
}

const ROLE_BADGE: Record<string, string> = {
  SALES_EXEC: 'bg-slate-100 text-slate-600',
  SALES_MANAGER: 'bg-blue-100 text-blue-700',
  ADMIN: 'bg-purple-100 text-purple-700',
  SUPER_ADMIN: 'bg-indigo-100 text-indigo-700',
}

type Props = {
  users: UserListItem[]
  teams: TeamListItem[]
}

export function UsersClient({ users, teams }: Props) {
  const [search, setSearch] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    )
  }, [users, search])

  const managers = users.filter((u) => u.role === 'SALES_MANAGER')

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
            {users.length} {users.length === 1 ? 'member' : 'members'} in your organisation
          </p>
        </div>
        <Button
          type="button"
          className="gap-2 min-h-[44px]"
          onClick={() => setInviteOpen(true)}
        >
          <UserPlus size={16} aria-hidden="true" />
          Invite user
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
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

      {/* Users table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-[var(--color-border)] bg-white gap-3">
          <Users size={40} className="text-[var(--color-muted)]" aria-hidden="true" />
          <p className="text-sm text-[var(--color-muted)]">
            {search ? 'No users match your search.' : 'No users found. Invite your first team member.'}
          </p>
          {!search && (
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
                    className="hover:bg-[var(--color-surface)] transition-colors"
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
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-[36px]"
                          onClick={() => setEditingUser(user)}
                        >
                          Edit
                        </Button>
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
              <div key={user.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--color-primary)]">{user.name}</p>
                    <p className="text-xs text-[var(--color-muted)]">{user.email}</p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      user.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {user.isActive ? 'Active' : 'Inactive'}
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
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 min-h-[44px]"
                    onClick={() => setEditingUser(user)}
                  >
                    Edit
                  </Button>
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
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teams section */}
      <TeamsSection teams={teams} managers={managers} />

      {/* Dialogs / sheets */}
      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        teams={teams}
      />
      <EditUserSheet
        user={editingUser}
        teams={teams}
        allUsers={users}
        onClose={() => setEditingUser(null)}
      />
    </div>
  )
}
