import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getTcTemplates, getServiceCategories } from '@/lib/actions/tc-templates'
import { TcTemplatesClient } from './TcTemplatesClient'
import { Role } from '@/lib/generated/prisma/enums'

export default async function TcTemplatesPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.user, 'manage:templates')) redirect('/dashboard')

  const [templates, categories] = await Promise.all([
    getTcTemplates(),
    getServiceCategories(),
  ])

  const isSuperAdmin = session.user.role === Role.SUPER_ADMIN

  // Custom categories already used across the section library — surfaced as
  // suggestions in the dialog alongside the service categories.
  const existingCategories = Array.from(
    new Set(templates.flatMap((t) => t.categories)),
  ).sort((a, b) => a.localeCompare(b))

  return (
    <TcTemplatesClient
      templates={templates}
      serviceCategories={categories}
      existingCategories={existingCategories}
      isSuperAdmin={isSuperAdmin}
    />
  )
}
