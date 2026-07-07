import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { ProfileClient } from './ProfileClient'

export default async function ProfilePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const { user } = session

  return (
    <ProfileClient
      initial={{
        name: user.name,
        email: user.email,
        jobTitle: user.jobTitle ?? '',
        signatureImageUrl: user.signatureImageUrl ?? '',
        avatarUrl: user.avatarUrl ?? '',
      }}
    />
  )
}
