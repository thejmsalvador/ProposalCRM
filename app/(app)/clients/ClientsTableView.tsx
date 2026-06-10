'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ClientListItem, HealthStatus } from '@/lib/queries/clients'

function HealthDot({ health }: { health: HealthStatus }) {
  const styles: Record<HealthStatus, { dot: string; label: string }> = {
    Active: { dot: 'bg-green-500', label: 'text-green-700' },
    Dormant: { dot: 'bg-amber-400', label: 'text-amber-700' },
    Lapsed: { dot: 'bg-red-500', label: 'text-red-700' },
  }
  const s = styles[health]
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
      <span className={`text-xs font-medium ${s.label}`}>{health}</span>
    </span>
  )
}

function formatPHP(value: number) {
  if (value === 0) return '₱0'
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `₱${(value / 1_000).toFixed(0)}K`
  return `₱${value.toLocaleString()}`
}

function formatLastActivity(date: Date | null): string {
  if (!date) return '—'
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

type Props = { clients: ClientListItem[] }

export function ClientsTableView({ clients }: Props) {
  const router = useRouter()

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Company</TableHead>
            <TableHead>Primary Contact</TableHead>
            <TableHead>Health</TableHead>
            <TableHead className="text-right">Lifetime Value</TableHead>
            <TableHead className="text-right">Won</TableHead>
            <TableHead className="text-right">Active</TableHead>
            <TableHead className="text-right">Win Rate</TableHead>
            <TableHead>Last Activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow
              key={client.id}
              className="cursor-pointer"
              onClick={() => router.push(`/clients/${client.id}`)}
            >
              <TableCell>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
                    {client.companyName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-medium text-slate-900 hover:text-indigo-600 truncate block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {client.companyName}
                    </Link>
                    {client.industry && (
                      <p className="text-xs text-slate-500 truncate">{client.industry}</p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-sm text-slate-600">
                {client.primaryContact?.contactName ? (
                  <>
                    {client.primaryContact.contactName}
                    {client.primaryContact.contactTitle && (
                      <span className="text-slate-400">
                        {', '}
                        {client.primaryContact.contactTitle}
                      </span>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell>
                <HealthDot health={client.health} />
              </TableCell>
              <TableCell className="text-right text-sm font-semibold text-slate-800">
                {formatPHP(client.lifetimeValue)}
              </TableCell>
              <TableCell className="text-right text-sm font-semibold text-green-700">
                {client.wonDeals}
              </TableCell>
              <TableCell className="text-right text-sm font-semibold text-indigo-700">
                {client.activeDeals}
              </TableCell>
              <TableCell className="text-right text-sm text-slate-600">
                {client.totalProposals === 0 ? '—' : `${client.winRate}%`}
              </TableCell>
              <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                {formatLastActivity(client.lastActivityAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
