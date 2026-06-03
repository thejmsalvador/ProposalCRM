'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { FunnelStep } from '@/lib/queries/dashboard'

const STEP_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  PENDING_APPROVAL: '#f59e0b',
  APPROVED: '#6366f1',
  SENT: '#a855f7',
  WON: '#16a34a',
}

type Props = { data: FunnelStep[] }

export function PipelineFunnel({ data }: Props) {
  if (data.every(d => d.count === 0)) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        No pipeline data
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={68}
          tick={{ fontSize: 12, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: '#f8fafc' }}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
          formatter={(value) => [value as number, 'Proposals']}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((entry, i) => (
            <Cell key={i} fill={STEP_COLORS[entry.status] ?? '#94a3b8'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
