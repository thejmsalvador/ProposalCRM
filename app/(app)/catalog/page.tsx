import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getServices, getExistingCategories, getTemplateOptions } from '@/lib/actions/catalog'
import { CatalogClient } from './CatalogClient'

export default async function CatalogPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.user, 'manage:catalog')) redirect('/dashboard')

  const [services, categories, templates] = await Promise.all([
    getServices(),
    getExistingCategories(),
    getTemplateOptions(),
  ])

  return (
    <CatalogClient
      services={services}
      categories={categories}
      paymentTemplates={templates.paymentTemplates}
      tcTemplates={templates.tcTemplates}
    />
  )
}
