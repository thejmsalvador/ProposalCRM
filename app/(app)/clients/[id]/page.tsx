import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getClientDetail } from '@/lib/queries/clients'
import { Role } from '@/lib/generated/prisma/enums'
import { ClientDetailClient } from './ClientDetailClient'

type Props = { params: Promise<{ id: string }> }

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect('/login')

  const client = await getClientDetail(
    id,
    session.user.id,
    session.user.role as Role,
    session.user.teamId ?? null,
  )

  if (!client) notFound()

  return (
    <ClientDetailClient
      client={client}
      currentUserId={session.user.id}
      currentUserRole={session.user.role as Role}
    />
  )
}
