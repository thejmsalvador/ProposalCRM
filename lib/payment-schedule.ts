/**
 * Payment-schedule computation for the client-facing PDF.
 *
 * Payment terms are stored as free-text rich HTML — either a PaymentTemplate body
 * or a per-proposal override. Examples seen in practice:
 *   - "50% upon signing, 50% upon final delivery."     → percentage milestones
 *   - "50-30-20"                                        → percentage shorthand
 *   - "Billed monthly on the 1st of each month. ..."    → monthly retainer
 *
 * We detect the scheme from that prose and turn the grand total into a concrete
 * installment breakdown, so the proposal shows real peso figures rather than just
 * describing how billing works. Detection is intentionally conservative: when the
 * text isn't a recognisable scheme we return null and the PDF falls back to
 * rendering the terms text on its own.
 */

export type Installment = {
  /** Human label, e.g. "Upon signing", "Month 1", "1st Payment". */
  label: string
  /** Share of the grand total as a percentage, or null for even monthly splits. */
  percent: number | null
  /** Amount in the proposal's base currency (₱), before any FX display conversion. */
  amount: number
  /**
   * For a monthly schedule that mixes a one-time fee with a retainer: the one-time
   * portion folded into this installment (Month 1). Lets the PDF annotate the row.
   */
  oneTimeAmount?: number
  /**
   * For a retainer with a downpayment: the downpayment amount folded into this
   * installment (Month 1), and the percentage of the grand total it represents.
   */
  downpaymentAmount?: number
  downpaymentPercent?: number
}

export type PaymentSchedule = {
  kind: 'percentage' | 'monthly'
  installments: Installment[]
  /** The grand total the schedule was computed from. Installments sum to this exactly. */
  total: number
}

/** Percentages must land within this of 100% to count as a full split. */
const PERCENT_TOLERANCE = 0.5

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Strip HTML tags and decode the entities our rich-text editor emits. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&rsquo;|&#8217;/gi, '’')
    .replace(/&[a-z0-9#]+;/gi, ' ') // drop any remaining entities
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Manual milestone schedule ───────────────────────────────────────────────
// A proposal can carry an explicit, hand-authored payment breakdown instead of
// (or alongside) the prose terms above. Each milestone names a trigger, a free-
// text due date, and a share of the grand total. The peso amount is always
// derived from the share so it stays in sync with the proposal total.

export type PaymentMilestone = {
  /** Milestone name, e.g. "Downpayment". */
  label: string
  /** Free-text due date / trigger, e.g. "Before the start of the project". */
  dueDate: string
  /** Share of the grand total, 0–100. */
  percent: number
}

/** Tolerance (in percentage points) for a milestone set to count as a full 100%. */
export const MILESTONE_PERCENT_TOLERANCE = 0.01

/**
 * How a milestone schedule turns percentages into peso amounts:
 *  - 'total':     every row is a share of the grand total; rows sum to 100%.
 *  - 'remaining': row 0 (upfront) is a share of the grand total; the succeeding
 *                 rows are shares of the leftover pool (total − upfront) and must
 *                 sum to 100% of that pool.
 */
export type MilestoneBasis = 'total' | 'remaining'

/** Coerce a stored/raw value into a basis; null/undefined/legacy ⇒ 'total'. */
export function normalizeBasis(raw: unknown): MilestoneBasis {
  return raw === 'remaining' ? 'remaining' : 'total'
}

/** Sum of milestone percentages, rounded to 2dp. */
export function milestonesPercentTotal(milestones: { percent: number }[]): number {
  return round2(milestones.reduce((sum, m) => sum + (Number(m.percent) || 0), 0))
}

/** True when the milestone percentages add up to 100% (within tolerance). */
export function milestonesSumTo100(milestones: { percent: number }[]): boolean {
  if (milestones.length === 0) return false
  return Math.abs(milestonesPercentTotal(milestones) - 100) <= MILESTONE_PERCENT_TOLERANCE
}

/**
 * Peso amount for each milestone, derived from its share of `total`. Rounding
 * drift lands on the last row so the amounts sum to `total` exactly.
 */
export function computeMilestoneAmounts(
  milestones: { percent: number }[],
  total: number,
): number[] {
  return amountsFromPercents(
    total,
    milestones.map((m) => Number(m.percent) || 0),
  )
}

/**
 * 'remaining' (pool) model: row 0 is a share of the grand total; the leftover
 * (total − upfront) is then split across the succeeding rows by their percentages.
 * Rounding drift lands on the last row so amounts still sum to `total` exactly.
 */
function computeRemainingAmounts(milestones: { percent: number }[], total: number): number[] {
  const percents = milestones.map((m) => Number(m.percent) || 0)
  if (percents.length === 0) return []
  const first = round2((total * percents[0]) / 100)
  const pool = round2(total - first)
  const rest = amountsFromPercents(pool, percents.slice(1))
  return [first, ...rest]
}

/** Peso amount for each milestone under the given basis. Amounts sum to `total`. */
export function computeMilestoneAmountsForBasis(
  milestones: { percent: number }[],
  total: number,
  basis: MilestoneBasis,
): number[] {
  return basis === 'remaining'
    ? computeRemainingAmounts(milestones, total)
    : computeMilestoneAmounts(milestones, total)
}

/**
 * Sum of the succeeding (rows 1..n) percentages — in 'remaining' mode this is
 * what must reach 100% of the leftover pool.
 */
export function remainingTailPercentTotal(milestones: { percent: number }[]): number {
  return milestonesPercentTotal(milestones.slice(1))
}

/**
 * Whether a milestone set fully bills the grand total under the given basis.
 * Empty is always allowed (the PDF prints prose instead of a schedule).
 *  - 'total':     all rows sum to 100%.
 *  - 'remaining': succeeding rows sum to 100% of the leftover pool. With no
 *                 succeeding rows, the lone upfront must itself be 100%.
 */
export function milestonesValidForBasis(
  milestones: { percent: number }[],
  basis: MilestoneBasis,
): boolean {
  if (milestones.length === 0) return true
  if (basis === 'total') return milestonesSumTo100(milestones)
  const tail = milestones.slice(1)
  if (tail.length === 0) {
    return Math.abs((Number(milestones[0].percent) || 0) - 100) <= MILESTONE_PERCENT_TOLERANCE
  }
  return milestonesSumTo100(tail)
}

/** Parse a stored Json value into typed milestones, dropping malformed entries. */
export function parsePaymentMilestones(raw: unknown): PaymentMilestone[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((m) => {
    if (m && typeof m === 'object' && 'percent' in m) {
      const o = m as Record<string, unknown>
      return [
        {
          label: String(o.label ?? ''),
          dueDate: String(o.dueDate ?? ''),
          percent: Number(o.percent) || 0,
        },
      ]
    }
    return []
  })
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffix[(v - 20) % 10] || suffix[v] || suffix[0]}`
}

function capitalize(s: string): string {
  const t = s.trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

/** Distribute `total` across `percents`; rounding drift lands on the last share. */
function amountsFromPercents(total: number, percents: number[]): number[] {
  const amounts = percents.map((p) => round2((total * p) / 100))
  const drift = round2(total - amounts.reduce((a, b) => a + b, 0))
  if (amounts.length) {
    amounts[amounts.length - 1] = round2(amounts[amounts.length - 1] + drift)
  }
  return amounts
}

/** Split `total` into `n` even shares; the last share absorbs the remainder. */
function amountsEven(total: number, n: number): number[] {
  const share = round2(total / n)
  const amounts = Array.from({ length: n }, () => share)
  amounts[n - 1] = round2(amounts[n - 1] + round2(total - share * n))
  return amounts
}

type Milestone = { percent: number; label: string | null }

/**
 * Pull percentage milestones from the terms text, or null when the text isn't a
 * percentage split. A split must have ≥2 parts that sum to ~100% — so a lone
 * "2% late fee" never qualifies.
 */
function parsePercentMilestones(text: string): Milestone[] | null {
  // Form 1: explicit percent signs, each optionally trailed by a label phrase,
  //   e.g. "50% upon signing, 50% upon final delivery" or "50% Downpayment — due …".
  //   The label stops at sentence punctuation, dashes, colons, the next percent, or a digit.
  const pctRe = /(\d{1,3}(?:\.\d+)?)\s*%\s*([^.,;:%\d–—-]*)/g
  const withSigns: Milestone[] = []
  let m: RegExpExecArray | null
  while ((m = pctRe.exec(text)) !== null) {
    const raw = (m[2] || '').trim()
    withSigns.push({ percent: parseFloat(m[1]), label: raw ? capitalize(raw) : null })
  }
  if (withSigns.length >= 2) {
    const sum = withSigns.reduce((a, b) => a + b.percent, 0)
    if (Math.abs(sum - 100) <= PERCENT_TOLERANCE) return withSigns
  }

  // Form 2: hyphen / slash shorthand, e.g. "50-30-20" or "50/50".
  const shortMatch = text.match(/\b\d{1,3}(?:\s*[-/]\s*\d{1,3})+\b/)
  if (shortMatch) {
    const nums = shortMatch[0].split(/[-/]/).map((s) => parseFloat(s.trim()))
    const inRange = nums.length >= 2 && nums.every((n) => n >= 1 && n <= 100)
    const sum = nums.reduce((a, b) => a + b, 0)
    if (inRange && Math.abs(sum - 100) <= PERCENT_TOLERANCE) {
      return nums.map((percent) => ({ percent, label: null }))
    }
  }

  return null
}

/** True when the terms describe recurring monthly billing. */
function isMonthly(text: string): boolean {
  return /\b(monthly|per month|each month|a month)\b/i.test(text)
}

/**
 * Read a downpayment percentage from the terms, e.g. "20% downpayment" or
 * "a downpayment of 20%". Returns null when there's no clear 0–100% downpayment.
 */
function parseDownpaymentPercent(text: string): number | null {
  const before = text.match(
    /(\d{1,3}(?:\.\d+)?)\s*%\s*(?:down[\s-]?payment|downpayment|deposit|\bdp\b)/i,
  )
  const after = text.match(
    /(?:down[\s-]?payment|downpayment|deposit|\bdp\b)\s*(?:of\s*)?(\d{1,3}(?:\.\d+)?)\s*%/i,
  )
  const m = before || after
  if (!m) return null
  const pct = parseFloat(m[1])
  return pct > 0 && pct < 100 ? pct : null
}

/** Read an explicit term length from the text, e.g. "over 12 months". */
function monthsFromText(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*month/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 1 ? n : null
}

/**
 * Derive a concrete installment schedule from free-text payment terms and the
 * grand total. Returns null when the terms aren't a recognisable scheme.
 *
 * @param paymentText     Plain text of the terms (run {@link stripHtml} on rich HTML first).
 * @param total           Grand total in the proposal's base currency (₱).
 * @param engagementMonths Engagement length in months (max monthly line-item quantity);
 *                         used to size a monthly breakdown.
 * @param oneTimeTotal    Sum of one-time (non-recurring) line totals. When paired with
 *                        `monthlyTotal` on a monthly scheme, this portion is billed
 *                        upfront in Month 1 instead of being spread across the term.
 * @param monthlyTotal    Sum of recurring (monthly) line totals.
 */
export function computePaymentSchedule(opts: {
  paymentText: string
  total: number
  engagementMonths?: number | null
  oneTimeTotal?: number
  monthlyTotal?: number
}): PaymentSchedule | null {
  const text = opts.paymentText || ''
  const total = opts.total
  if (!text.trim() || !(total > 0)) return null

  // 1) Percentage milestones win — an explicit split is unambiguous.
  const milestones = parsePercentMilestones(text)
  if (milestones) {
    const amounts = amountsFromPercents(
      total,
      milestones.map((x) => x.percent),
    )
    return {
      kind: 'percentage',
      total,
      installments: milestones.map((ms, i) => ({
        label: ms.label || `${ordinal(i + 1)} Payment`,
        percent: ms.percent,
        amount: amounts[i],
      })),
    }
  }

  // 2) Monthly billing → even split across the engagement length. We prefer the
  //    length derived from line items, falling back to an explicit count in the text.
  if (isMonthly(text)) {
    const n =
      opts.engagementMonths && opts.engagementMonths >= 2
        ? Math.round(opts.engagementMonths)
        : monthsFromText(text)
    if (n && n >= 2) {
      // Downpayment retainer: a percentage of the grand total is collected upfront
      // with Month 1, and the remaining balance is spread evenly across the term.
      // Triggered by the terms text (e.g. "20% downpayment, balance billed monthly").
      const downpaymentPercent = parseDownpaymentPercent(text)
      if (downpaymentPercent) {
        const dpShare = round2((total * downpaymentPercent) / 100)
        const recurringShare = round2(total - dpShare)
        return {
          kind: 'monthly',
          total,
          installments: amountsEven(recurringShare, n).map((amount, i) => ({
            label: i === 0 ? 'Downpayment + Month 1' : `Month ${i + 1}`,
            percent: null,
            amount: i === 0 ? round2(amount + dpShare) : amount,
            ...(i === 0 ? { downpaymentAmount: dpShare, downpaymentPercent } : {}),
          })),
        }
      }

      const oneTime = Math.max(0, opts.oneTimeTotal ?? 0)
      const monthly = opts.monthlyTotal != null ? Math.max(0, opts.monthlyTotal) : null
      const lineSum = oneTime + (monthly ?? 0)

      // Mixed one-time fee + monthly retainer: bill the one-time portion upfront in
      // Month 1 and spread only the recurring portion across the term. We scale by
      // the grand total so any discount/VAT (the gap between line totals and the
      // grand total) is shared proportionally and the schedule still sums to `total`.
      if (oneTime > 0 && monthly && monthly > 0 && lineSum > 0) {
        const oneTimeShare = round2((total * oneTime) / lineSum)
        const recurringShare = round2(total - oneTimeShare)
        return {
          kind: 'monthly',
          total,
          installments: amountsEven(recurringShare, n).map((amount, i) => ({
            label: `Month ${i + 1}`,
            percent: null,
            amount: i === 0 ? round2(amount + oneTimeShare) : amount,
            ...(i === 0 ? { oneTimeAmount: oneTimeShare } : {}),
          })),
        }
      }

      // Pure monthly retainer: even split of the whole grand total.
      return {
        kind: 'monthly',
        total,
        installments: amountsEven(total, n).map((amount, i) => ({
          label: `Month ${i + 1}`,
          percent: null,
          amount,
        })),
      }
    }
  }

  return null
}
