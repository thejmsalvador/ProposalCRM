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

  // ADMIN and SUPER_ADMIN can import; SALES_MANAGER can manage catalog but not import
  const canImport = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'

  return (
    <CatalogClient
      services={services}
      categories={categories}
      paymentTemplates={templates.paymentTemplates}
      tcTemplates={templates.tcTemplates}
      canImport={canImport}
    />
  )
}
