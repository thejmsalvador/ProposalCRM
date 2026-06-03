import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Role } from '@/lib/generated/prisma/enums'
import { getUsers, getTeams } from '@/lib/actions/users'
import { UsersClient } from './UsersClient'

export default async function UsersPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.user.role !== Role.SUPER_ADMIN) redirect('/dashboard')

  const [users, teams] = await Promise.all([getUsers(), getTeams()])

  return <UsersClient users={users} teams={teams} />
}
