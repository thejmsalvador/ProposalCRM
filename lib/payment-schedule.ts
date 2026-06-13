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

/** Strip HTML tags and decode the handful of entities our rich-text editor emits. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
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
  //   e.g. "50% upon signing, 50% upon final delivery".
  const pctRe = /(\d{1,3}(?:\.\d+)?)\s*%\s*([^.,;%\d]*)/g
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
