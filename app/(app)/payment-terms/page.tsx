import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getPaymentTerms } from '@/lib/actions/payment-terms'
import { PaymentTermsClient } from './PaymentTermsClient'

export default async function PaymentTermsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.user, 'manage:templates')) redirect('/dashboard')

  const templates = await getPaymentTerms()

  return <PaymentTermsClient templates={templates} />
}
