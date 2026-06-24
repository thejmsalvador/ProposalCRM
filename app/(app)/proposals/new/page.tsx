import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getWizardData } from '@/lib/actions/proposals'
import { getProposalTemplates } from '@/lib/actions/templates'
import { prisma } from '@/lib/prisma'
import { WizardClient } from './WizardClient'

type Props = {
  searchParams: Promise<{ clientId?: string }>
}

export default async function NewProposalPage({ searchParams }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.user, 'create:proposal')) redirect('/dashboard')

  const { clientId } = await searchParams

  const [
    { approvers, services, paymentTemplates, tcTemplates, modesOfPayment, systemSettings },
    proposalTemplates,
  ] = await Promise.all([getWizardData(), getProposalTemplates()])

  // Pre-populate client fields if clientId is provided
  let initialValues: Record<string, unknown> | undefined
  if (clientId) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        contacts: { where: { isPrimary: true }, take: 1 },
      },
    })
    if (client) {
      const primary = client.contacts[0]
      initialValues = {
        clientId: client.id,
        clientName: client.companyName,
        contactName: primary?.contactName ?? '',
        contactTitle: primary?.contactTitle ?? '',
        department: primary?.department ?? '',
        contactEmail: primary?.email ?? '',
        contactPhone: primary?.phone ?? '',
        businessAddress: client.address ?? '',
      }
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <WizardClient
        services={services}
        approvers={approvers}
        paymentTemplates={paymentTemplates}
        tcTemplates={tcTemplates}
        modesOfPayment={modesOfPayment}
        systemSettings={systemSettings}
        proposalTemplates={proposalTemplates}
        currentUser={{
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          role: session.user.role,
        }}
        initialValues={initialValues}
      />
    </div>
  )
}
