'use client'

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { StatusCount } from '@/lib/queries/dashboard'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  PENDING_APPROVAL: '#f59e0b',
  REVISION_REQUIRED: '#f97316',
  APPROVED: '#6366f1',
  SENT: '#a855f7',
  WON: '#16a34a',
  LOST: '#dc2626',
  ON_HOLD: '#64748b',
  EXPIRED: '#9ca3af',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending',
  REVISION_REQUIRED: 'Revision',
  APPROVED: 'Approved',
  SENT: 'Sent',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On Hold',
  EXPIRED: 'Expired',
}

type Props = { data: StatusCount[] }

export function StatusDonut({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        No proposals yet
      </div>
    )
  }

  const chartData = data.map(d => ({
    name: STATUS_LABELS[d.status] ?? d.status,
    value: d.count,
    fill: STATUS_COLORS[d.status] ?? '#94a3b8',
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
          dataKey="value"
        >
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [value as number, name as string]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => <span className="text-slate-600">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
