import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getUsers, getTeams } from '@/lib/actions/users'
import { UsersClient } from './UsersClient'

export default async function UsersPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canManageUsers = can(session.user, 'manage:users')
  const canDeleteUsers = can(session.user, 'delete:user')

  // SUPER_ADMIN manages users; COO/CEO reach this page only to delete.
  if (!canManageUsers && !canDeleteUsers) redirect('/dashboard')

  const [users, teams] = await Promise.all([getUsers(), getTeams()])

  return (
    <UsersClient
      users={users}
      teams={teams}
      currentUserId={session.user.id}
      canManageUsers={canManageUsers}
      canDeleteUsers={canDeleteUsers}
    />
  )
}
