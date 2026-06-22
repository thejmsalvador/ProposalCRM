'use client'

import { Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/validations/proposals'
import {
  milestonesPercentTotal,
  remainingTailPercentTotal,
  milestonesValidForBasis,
  MILESTONE_PERCENT_TOLERANCE,
  type MilestoneBasis,
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

const BASIS_OPTIONS: { value: MilestoneBasis; label: string }[] = [
  { value: 'total', label: 'Share of grand total' },
  { value: 'remaining', label: 'Split the remaining balance' },
]

const BASIS_HELP: Record<MilestoneBasis, string> = {
  total: 'Each milestone is a share of the grand total; percentages must total 100%.',
  remaining:
    'The first milestone is a share of the grand total; the rest split the remaining balance and must total 100% of it.',
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
  /** How percentages turn into amounts. Defaults to 'total' (legacy behavior). */
  basis?: MilestoneBasis
  /** When provided (and not read-only), renders the basis toggle. */
  onBasisChange?: (basis: MilestoneBasis) => void
}

export function MilestoneEditor({
  milestones,
  onChange,
  total,
  amountLabel = '₱ of Grand Total',
  readOnly = false,
  emptyHint = 'No milestones yet.',
  basis = 'total',
  onBasisChange,
}: Props) {
  const hasMilestones = milestones.length > 0
  const isBalanced = milestonesValidForBasis(milestones, basis)
  const showToggle = !readOnly && !!onBasisChange

  // Live, "literal" amounts (no rounding-drift redistribution) so an in-progress,
  // not-yet-100% schedule shows each row at its true percentage. The drift-aware
  // computeMilestoneAmountsForBasis is used by the render surfaces on validated data.
  const firstAmount = hasMilestones
    ? round2((total * (Number(milestones[0].percent) || 0)) / 100)
    : 0
  const pool = round2(total - firstAmount)

  function rowAmount(index: number, percent: number): number {
    const p = Number(percent) || 0
    if (basis === 'remaining') {
      return index === 0 ? round2((total * p) / 100) : round2((pool * p) / 100)
    }
    return round2((total * p) / 100)
  }

  // Footer total reflects the *intended* billing so a shortfall is visible.
  const percentTotal = milestonesPercentTotal(milestones)
  const tailPercentTotal = remainingTailPercentTotal(milestones)
  const amountTotal =
    basis === 'remaining'
      ? round2(firstAmount + (pool * tailPercentTotal) / 100)
      : round2((total * percentTotal) / 100)

  // For the amber banner: how far the active percentages are from a full bill.
  const totalRemaining = round2(100 - percentTotal)
  const tailRemaining = round2(100 - tailPercentTotal)

  function update(index: number, patch: Partial<EditorMilestone>) {
    onChange(milestones.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  function add() {
    if (basis === 'remaining') {
      // First row = upfront (user picks); later rows seed the rest of the pool.
      const seed = milestones.length === 0 ? 0 : Math.max(0, tailRemaining)
      onChange([...milestones, newMilestone(seed)])
      return
    }
    onChange([...milestones, newMilestone(totalRemaining > 0 ? totalRemaining : 0)])
  }

  function remove(index: number) {
    onChange(milestones.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      {showToggle ? (
        <div className="space-y-1.5">
          <div
            className="inline-flex flex-wrap gap-0.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50 p-0.5"
            role="group"
            aria-label="Milestone calculation basis"
          >
            {BASIS_OPTIONS.map((opt) => {
              const active = basis === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onBasisChange?.(opt.value)}
                  className={`min-h-[36px] rounded-[calc(var(--radius-sm)-2px)] px-3 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-white text-[var(--color-primary)] shadow-sm'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-primary)]'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-[var(--color-muted)]">{BASIS_HELP[basis]}</p>
        </div>
      ) : (
        readOnly &&
        basis === 'remaining' && (
          <p className="text-xs text-[var(--color-muted)]">
            Calculated on the remaining balance — the first milestone is a share of the grand total;
            the rest split the remaining balance.
          </p>
        )
      )}

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
                const amount = rowAmount(idx, m.percent)
                // In 'remaining' mode the percent of row 0 and the rest mean different
                // things, so spell out the base each row's percentage applies to.
                const basisHint =
                  basis === 'remaining' ? (idx === 0 ? 'of grand total' : 'of remaining') : null
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
                      {basisHint && (
                        <span className="mt-1 block text-[11px] font-normal text-[var(--color-muted)]">
                          {basisHint}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 align-middle text-right tabular-nums font-medium">
                      {formatCurrency(amount)}
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
                  {basis === 'remaining' ? 'Total billed' : 'Total'}
                </td>
                <td
                  className={`py-2 px-3 text-right tabular-nums ${
                    isBalanced ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                  }`}
                >
                  {basis === 'remaining' ? `${tailPercentTotal}%` : `${percentTotal}%`}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(amountTotal)}</td>
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
                <span>
                  {basis === 'remaining'
                    ? `Upfront ${formatCurrency(firstAmount)}; remaining ${formatCurrency(
                        pool,
                      )} fully allocated.`
                    : 'Milestones total 100%.'}
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>
                  {basis === 'remaining' ? (
                    <>
                      Upfront {formatCurrency(firstAmount)}. Remaining {formatCurrency(pool)} —
                      succeeding milestones total {tailPercentTotal}%{' '}
                      {tailRemaining > MILESTONE_PERCENT_TOLERANCE
                        ? `(${tailRemaining}% short of 100%)`
                        : `(${Math.abs(tailRemaining)}% over 100%)`}
                      . Adjust before saving.
                    </>
                  ) : (
                    <>
                      Milestones total {percentTotal}% —{' '}
                      {totalRemaining > MILESTONE_PERCENT_TOLERANCE
                        ? `${totalRemaining}% short of`
                        : `${Math.abs(totalRemaining)}% over`}{' '}
                      100%. Adjust before saving.
                    </>
                  )}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
