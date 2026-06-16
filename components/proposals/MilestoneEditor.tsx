'use client'

import { Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/validations/proposals'
import {
  milestonesPercentTotal,
  milestonesSumTo100,
  MILESTONE_PERCENT_TOLERANCE,
} from '@/lib/payment-schedule'

export type EditorMilestone = {
  id: string
  label: string
  dueDate: string
  percent: number
}

export function newMilestone(percent = 0): EditorMilestone {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `ms-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return { id, label: '', dueDate: '', percent }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

type Props = {
  milestones: EditorMilestone[]
  onChange: (next: EditorMilestone[]) => void
  /** Base figure (₱) the percentage column is applied to — the grand total, or a
   *  sample total when previewing a template. */
  total: number
  /** Header label for the computed money column. */
  amountLabel?: string
  /** Read-only inherited view: no inputs, no add/remove, no validation banner. */
  readOnly?: boolean
  /** Empty-state copy shown when there are no milestones. */
  emptyHint?: string
}

export function MilestoneEditor({
  milestones,
  onChange,
  total,
  amountLabel = '₱ of Grand Total',
  readOnly = false,
  emptyHint = 'No milestones yet.',
}: Props) {
  const percentTotal = milestonesPercentTotal(milestones)
  const amountTotal = round2((total * percentTotal) / 100)
  const hasMilestones = milestones.length > 0
  const isBalanced = milestonesSumTo100(milestones)
  const remaining = round2(100 - percentTotal)

  function update(index: number, patch: Partial<EditorMilestone>) {
    onChange(milestones.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  function add() {
    onChange([...milestones, newMilestone(remaining > 0 ? remaining : 0)])
  }

  function remove(index: number) {
    onChange(milestones.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      {hasMilestones ? (
        <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--color-border)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-slate-50">
                <th className="text-left py-2 px-3 font-medium text-[var(--color-muted)]">
                  Milestone
                </th>
                <th className="text-left py-2 px-3 font-medium text-[var(--color-muted)]">
                  Due Date
                </th>
                <th className="text-right py-2 px-3 font-medium text-[var(--color-muted)] w-[110px]">
                  %
                </th>
                <th className="text-right py-2 px-3 font-medium text-[var(--color-muted)] w-[150px]">
                  {amountLabel}
                </th>
                {!readOnly && <th className="w-[52px] py-2 px-2" />}
              </tr>
            </thead>
            <tbody>
              {milestones.map((m, idx) => {
                const rowAmount = round2((total * (Number(m.percent) || 0)) / 100)
                return (
                  <tr
                    key={m.id || idx}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <td className="py-2 px-3 align-top">
                      {readOnly ? (
                        <span className="font-medium text-[var(--color-primary)]">
                          {m.label || `Milestone ${idx + 1}`}
                        </span>
                      ) : (
                        <Input
                          aria-label={`Milestone ${idx + 1} name`}
                          value={m.label}
                          onChange={(e) => update(idx, { label: e.target.value })}
                          placeholder="e.g. Downpayment"
                          className="h-10"
                        />
                      )}
                    </td>
                    <td className="py-2 px-3 align-top">
                      {readOnly ? (
                        <span className="text-[var(--color-muted)]">{m.dueDate || '—'}</span>
                      ) : (
                        <Input
                          aria-label={`Milestone ${idx + 1} due date`}
                          value={m.dueDate}
                          onChange={(e) => update(idx, { dueDate: e.target.value })}
                          placeholder="e.g. Before the start of the project"
                          className="h-10"
                        />
                      )}
                    </td>
                    <td className="py-2 px-3 align-top text-right tabular-nums">
                      {readOnly ? (
                        <span>{m.percent}%</span>
                      ) : (
                        <div className="relative">
                          <Input
                            aria-label={`Milestone ${idx + 1} percentage`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            step="any"
                            value={Number.isFinite(m.percent) && m.percent !== 0 ? m.percent : ''}
                            onChange={(e) =>
                              update(idx, {
                                percent: e.target.value === '' ? 0 : parseFloat(e.target.value),
                              })
                            }
                            placeholder="0"
                            className="h-10 text-right pr-6 tabular-nums"
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)]">
                            %
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 align-middle text-right tabular-nums font-medium">
                      {formatCurrency(rowAmount)}
                    </td>
                    {!readOnly && (
                      <td className="py-2 px-2 align-middle text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove milestone ${idx + 1}`}
                          className="h-9 w-9 text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                          onClick={() => remove(idx)}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border)] bg-slate-50 font-semibold">
                <td className="py-2 px-3" colSpan={2}>
                  Total
                </td>
                <td
                  className={`py-2 px-3 text-right tabular-nums ${
                    isBalanced ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                  }`}
                >
                  {percentTotal}%
                </td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {formatCurrency(amountTotal)}
                </td>
                {!readOnly && <td className="py-2 px-2" />}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="text-center py-6 border border-dashed border-[var(--color-border)] rounded-[var(--radius-sm)]">
          <p className="text-sm text-[var(--color-muted)]">{emptyHint}</p>
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 min-h-[44px] self-start"
            onClick={add}
          >
            <Plus size={15} />
            Add milestone
          </Button>

          {hasMilestones &&
            (isBalanced ? (
              <div className="flex items-center gap-2 text-sm text-[var(--color-success)]">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>Milestones total 100%.</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>
                  Milestones total {percentTotal}% —{' '}
                  {remaining > MILESTONE_PERCENT_TOLERANCE
                    ? `${remaining}% short of`
                    : `${Math.abs(remaining)}% over`}{' '}
                  100%. Adjust before saving.
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
