import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { sanitizeHtml } from '@/lib/sanitize'
import {
  getServiceById,
  getServiceAuditLog,
  getExistingCategories,
  getTemplateOptions,
} from '@/lib/actions/catalog'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/validations/proposals'
import { engagementLabel } from '@/lib/validations/catalog'
import { EditServiceButton } from './EditServiceButton'

function formatRate(rate: string | null) {
  if (!rate) return '—'
  return formatCurrency(parseFloat(rate))
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  archived: 'Archived',
  restored: 'Restored',
}

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-green-100 text-green-700',
  updated: 'bg-blue-100 text-blue-700',
  archived: 'bg-slate-100 text-slate-600',
  restored: 'bg-indigo-100 text-indigo-700',
}

type Params = { id: string }

export default async function ServiceDetailPage({ params }: { params: Params }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.user, 'manage:catalog')) redirect('/dashboard')

  const [service, auditLog, categories, templateOptions] = await Promise.all([
    getServiceById(params.id),
    getServiceAuditLog(params.id),
    getExistingCategories(),
    getTemplateOptions(),
  ])

  if (!service) notFound()

  const itemTotal = parseFloat(service.defaultRate) * service.engagementTerm
  const expensesTotal = service.estimatedExpenses.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link */}
      <Link href="/catalog">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 -ml-1 min-h-[36px]">
          <ArrowLeft size={14} />
          Back to catalog
        </Button>
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-[var(--color-primary)]">{service.name}</h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                service.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {service.isActive ? 'Active' : 'Archived'}
            </span>
          </div>
          <p className="text-sm text-[var(--color-muted)] mt-1">{service.category}</p>
        </div>
        <div className="shrink-0">
          <EditServiceButton
            service={service}
            categories={categories}
            paymentTemplates={templateOptions.paymentTemplates}
            tcTemplates={templateOptions.tcTemplates}
          />
        </div>
      </div>

      {/* Detail card */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
        <Row label="Service Category">{service.category}</Row>
        <Row label="Description">{service.description}</Row>
        <Row label="Engagement Type">{engagementLabel(service.unit)}</Row>
        <Row label="Engagement Term">
          {service.engagementTerm}
          {service.unit === 'monthly' ? ` month${service.engagementTerm !== 1 ? 's' : ''}` : ''}
        </Row>
        <Row label="Item Cost">{formatRate(service.defaultRate)}</Row>
        <Row label="Item Total">
          <span className="font-semibold">{formatRate(String(itemTotal))}</span>
        </Row>
        <Row label="Default payment template">{service.paymentTemplateName ?? '—'}</Row>
        <Row label="Default T&C template">{service.tcTemplateName ?? '—'}</Row>
        {service.internalNotes && (
          <Row label="Internal notes">
            <span className="whitespace-pre-wrap">{service.internalNotes}</span>
          </Row>
        )}
        <Row label="Created">{formatDate(service.createdAt)}</Row>
        <Row label="Last updated">{formatDate(service.updatedAt)}</Row>
      </div>

      {/* Estimated project expenses — internal only */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-semibold text-[var(--color-primary)]">
            Estimated Project Expenses
          </h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            Internal only
          </span>
        </div>
        {service.estimatedExpenses.length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--color-border)] px-5 py-6 text-center text-sm text-[var(--color-muted)]">
            No estimated expenses recorded.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
            {service.estimatedExpenses.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="text-[var(--color-primary)]">{e.label}</span>
                <span className="tabular-nums text-[var(--color-primary)]">
                  {formatCurrency(e.amount)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 px-5 py-3 text-sm bg-[var(--color-surface)]">
              <span className="font-medium text-[var(--color-primary)]">Total</span>
              <span className="font-semibold tabular-nums text-[var(--color-primary)]">
                {formatCurrency(expensesTotal)}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Default scope of work */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-primary)] mb-2">
          Default scope of work
        </h2>
        <div
          className="bg-white rounded-xl border border-[var(--color-border)] px-5 py-4 prose prose-sm max-w-none text-[var(--color-primary)]"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(service.defaultScope) || '<p class="text-[var(--color-muted)]">No scope defined.</p>' }}
        />
      </section>

      {/* Audit log */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-primary)] mb-2">Audit history</h2>
        {auditLog.length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--color-border)] px-5 py-8 text-center text-sm text-[var(--color-muted)]">
            No audit history yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Actor</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Action</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {auditLog.map((entry) => (
                    <tr key={entry.id} className="hover:bg-[var(--color-surface)]">
                      <td className="px-4 py-3 text-[var(--color-muted)] whitespace-nowrap">
                        {formatDate(entry.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-primary)]">
                        {entry.actorName}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            ACTION_COLORS[entry.action] ?? 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted)] text-xs">
                        <DiffSummary diff={entry.diffJson} action={entry.action} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile audit cards */}
            <div className="md:hidden divide-y divide-[var(--color-border)]">
              {auditLog.map((entry) => (
                <div key={entry.id} className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--color-primary)] text-sm">
                      {entry.actorName}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        ACTION_COLORS[entry.action] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">{formatDate(entry.createdAt)}</p>
                  <div className="text-xs text-[var(--color-muted)]">
                    <DiffSummary diff={entry.diffJson} action={entry.action} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 px-5 py-3">
      <dt className="w-44 shrink-0 text-xs font-medium text-[var(--color-muted)] pt-0.5">
        {label}
      </dt>
      <dd className="text-sm text-[var(--color-primary)] flex-1">{children}</dd>
    </div>
  )
}

function DiffSummary({ diff, action }: { diff: unknown; action: string }) {
  if (action === 'created') return <span>Service created.</span>
  if (action === 'archived') return <span>Service archived.</span>
  if (action === 'restored') return <span>Service restored.</span>

  if (!diff || typeof diff !== 'object') return <span>—</span>

  const d = diff as Record<string, unknown>
  const before = d.before as Record<string, string> | undefined
  const after = d.after as Record<string, string> | undefined

  if (!before || !after) return <span>Updated.</span>

  const changes: string[] = []
  const fields = Object.keys(after) as Array<keyof typeof after>
  for (const key of fields) {
    const bVal = before[key as string]
    const aVal = after[key as string]
    if (String(bVal) !== String(aVal)) {
      const label = FIELD_LABELS[key as string] ?? key
      changes.push(`${label}: ${bVal ?? '—'} → ${aVal ?? '—'}`)
    }
  }

  if (changes.length === 0) return <span>No changes recorded.</span>

  return (
    <ul className="space-y-0.5 list-disc list-inside">
      {changes.map((c, i) => (
        <li key={i}>{c}</li>
      ))}
    </ul>
  )
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Service name',
  category: 'Service category',
  description: 'Description',
  unit: 'Engagement type',
  engagementTerm: 'Engagement term',
  estimatedExpenses: 'Estimated project expenses',
  defaultRate: 'Item cost',
  paymentTplId: 'Payment template',
  tcTemplateId: 'T&C template',
  internalNotes: 'Internal notes',
}
