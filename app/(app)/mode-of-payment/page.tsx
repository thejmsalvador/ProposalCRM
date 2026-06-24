import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getModesOfPayment } from '@/lib/actions/mode-of-payment'
import { ModeOfPaymentClient } from './ModeOfPaymentClient'

export default async function ModeOfPaymentPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.user, 'manage:templates')) redirect('/dashboard')

  const modes = await getModesOfPayment()

  return <ModeOfPaymentClient modes={modes} />
}
