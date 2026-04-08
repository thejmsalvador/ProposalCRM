import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getClientList } from '@/lib/queries/clients'
import { Role } from '@/lib/generated/prisma/enums'
import { ClientsClient } from './ClientsClient'

export default async function ClientsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const clients = await getClientList(
    session.user.id,
    session.user.role as Role,
    session.user.teamId ?? null,
  )

  return <ClientsClient clients={clients} />
}
