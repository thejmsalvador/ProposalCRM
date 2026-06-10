import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getClientList, getContactList } from '@/lib/queries/clients'
import { Role } from '@/lib/generated/prisma/enums'
import { ClientsClient } from './ClientsClient'

type Props = {
  searchParams: Promise<{ tab?: string }>
}

export default async function ClientsPage({ searchParams }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { tab } = await searchParams

  const [clients, contacts] = await Promise.all([
    getClientList(
      session.user.id,
      session.user.role as Role,
      session.user.teamId ?? null,
    ),
    getContactList(
      session.user.id,
      session.user.role as Role,
      session.user.teamId ?? null,
    ),
  ])

  return (
    <ClientsClient
      clients={clients}
      contacts={contacts}
      initialTab={tab === 'contacts' ? 'contacts' : 'companies'}
    />
  )
}
