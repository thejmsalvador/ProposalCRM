import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { verifyPdfToken } from '@/lib/pdf-token'
import { engagementLabel } from '@/lib/validations/catalog'
import {
  formatCurrency,
  parseSignatories,
  isCompleteSignatory,
} from '@/lib/validations/proposals'
import {
  computePaymentSchedule,
  computeMilestoneAmountsForBasis,
  milestonesPercentTotal,
  parsePaymentMilestones,
  normalizeBasis,
  stripHtml,
} from '@/lib/payment-schedule'
import { resolveTcSections } from '@/lib/tc-sections'
import { resolveModesOfPayment } from '@/lib/mode-of-payment-sections'
import { sanitizeHtml } from '@/lib/sanitize'
import { DEFAULT_AGENCY_NAME } from '@/lib/branding'

type Props = {
  params: { proposalId: string }
  searchParams: { token?: string; part?: string }
}

function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: params.proposalId },
    select: { number: true, projectTitle: true },
  })
  if (!proposal) return { title: 'Proposal' }
  return { title: `${proposal.number} — ${proposal.projectTitle}` }
}

export default async function PdfPage({ params, searchParams }: Props) {
  // ── Token verification ───────────────────────────────────────────────────────
  // In development we skip the token so the template can be previewed directly in
  // the browser (designers iterating on layout). Production always requires it.
  const isDev = process.env.NODE_ENV !== 'production'
  if (!isDev) {
    const secret = process.env.PDF_SECRET
    if (!secret) notFound()
    if (!verifyPdfToken(searchParams.token, params.proposalId, secret)) notFound()
  }

  // The generate route renders the document in two passes: the full-bleed cover
  // (no Puppeteer footer) and the continuously flowing body (Puppeteer margins +
  // footer with real page numbers), merged afterwards. Without ?part= both are
  // rendered, for previewing the template directly in the browser.
  const part =
    searchParams.part === 'cover' || searchParams.part === 'body'
      ? searchParams.part
      : 'all'
  const showCover = part !== 'body'
  const showBody = part !== 'cover'

  // ── Fetch data ───────────────────────────────────────────────────────────────
  const [proposal, settings] = await Promise.all([
    prisma.proposal.findUnique({
      where: { id: params.proposalId },
      include: {
        createdBy: { select: { name: true, jobTitle: true } },
        lineItems: {
          orderBy: { sortOrder: 'asc' },
          include: { service: { select: { category: true } } },
        },
        paymentTemplate: {
          select: { bodyRichText: true, milestones: true, milestoneBasis: true },
        },
        tcTemplate: { select: { bodyRichText: true } },
      },
    }),
    prisma.systemSettings.findFirst(),
  ])

  if (!proposal) notFound()

  const accent = settings?.brandColorHex ?? '#4F46E5'
  const agencyName = settings?.agencyName ?? DEFAULT_AGENCY_NAME

  const nonOptionalItems = proposal.lineItems.filter((li) => !li.isOptional)
  const optionalItems = proposal.lineItems.filter((li) => li.isOptional)

  const paymentHtml =
    proposal.paymentTermsOverride || proposal.paymentTemplate?.bodyRichText || ''
  // New model: ordered, multi-select T&C sections compiled in order (override applied).
  const tcSections = await resolveTcSections(proposal.tcSections)
  // Legacy fallback for proposals created before the section model.
  const tcHtml = proposal.tcOverride || proposal.tcTemplate?.bodyRichText || ''
  const hasTc = tcSections.length > 0 || !!tcHtml

  // Selected company bank accounts ("Mode of Payment"), shown with payment terms.
  const modesOfPayment = await resolveModesOfPayment(proposal.modesOfPayment)
  const hasModesOfPayment = modesOfPayment.length > 0

  // ── Signatories ──────────────────────────────────────────────────────────────
  // Client-side "Conforme" signatories captured in the wizard (signed off-platform).
  const signatories = parseSignatories(proposal.signatories).filter(isCompleteSignatory)
  // Internal/agency sign-off: the actual COO + CEO who approved, with their stored
  // signature image. Only resolved once both have signed (status APPROVED).
  const approverIds = [proposal.cooApprovedById, proposal.ceoApprovedById].filter(
    (id): id is string => !!id,
  )
  const approverRows =
    proposal.status === 'APPROVED' && approverIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: approverIds } },
          select: { id: true, name: true, jobTitle: true, signatureImageUrl: true },
        })
      : []
  // Preserve COO-then-CEO order (findMany returns no guaranteed order).
  const internalSignatories = approverIds
    .map((id) => approverRows.find((u) => u.id === id))
    .filter((u): u is (typeof approverRows)[number] => !!u)
  const hasSignatories = signatories.length > 0 || internalSignatories.length > 0

  // ── Pricing maths (all stored in ₱) ──────────────────────────────────────────
  const subtotal = parseFloat(proposal.subtotal.toString())
  const total = parseFloat(proposal.total.toString())
  const discountValue = proposal.discountValue
    ? parseFloat(proposal.discountValue.toString())
    : null
  const discountAmt =
    discountValue !== null && discountValue > 0
      ? proposal.discountType === 'percentage'
        ? (subtotal * discountValue) / 100
        : discountValue
      : 0
  const vatRate = proposal.vatRate ? parseFloat(proposal.vatRate.toString()) : null
  const vatAmount = vatRate ? ((subtotal - discountAmt) * vatRate) / 100 : null

  // Client-facing document renders in the proposal currency, converted at the
  // manual rate (₱ per 1 unit). Falls back to ₱ when there is no rate.
  const fxRate =
    proposal.currency !== 'PHP' && proposal.exchangeRate
      ? parseFloat(proposal.exchangeRate.toString())
      : null
  const displayCurrency = fxRate && fxRate > 0 ? proposal.currency : 'PHP'
  const money = (value: string | number | null | undefined): string => {
    const n = parseFloat(String(value ?? '0'))
    const safe = isNaN(n) ? 0 : n
    return formatCurrency(fxRate && fxRate > 0 ? safe / fxRate : safe, displayCurrency)
  }

  // ── Payment schedule ─────────────────────────────────────────────────────────
  // Engagement length comes from the monthly line items — legacy units may read
  // "month" or "monthly", so we match loosely and take the longest one to size a
  // monthly breakdown. Percentage schemes ("50/50", "50-30-20") ignore this.
  const monthlyItems = nonOptionalItems.filter((li) => /month/i.test(li.unit))
  const engagementMonths = monthlyItems.reduce(
    (max, li) => Math.max(max, parseFloat(li.quantity.toString()) || 0),
    0,
  )
  const monthlyTotal = monthlyItems.reduce(
    (sum, li) => sum + (parseFloat(li.lineTotal.toString()) || 0),
    0,
  )
  const oneTimeTotal = nonOptionalItems
    .filter((li) => !/month/i.test(li.unit))
    .reduce((sum, li) => sum + (parseFloat(li.lineTotal.toString()) || 0), 0)

  // Hand-authored milestone breakdown takes precedence over the prose-derived
  // schedule. The proposal's own override wins; otherwise it inherits the payment
  // template's default schedule. Peso amounts are derived from the grand total.
  // With no milestones at all we fall back to detecting a schedule from the terms.
  const manualMilestones =
    proposal.paymentMilestones != null
      ? parsePaymentMilestones(proposal.paymentMilestones)
      : parsePaymentMilestones(proposal.paymentTemplate?.milestones)
  // Basis follows the schedule in effect: the proposal's own override, else the template's.
  const milestoneBasis =
    proposal.paymentMilestones != null
      ? normalizeBasis(proposal.milestoneBasis)
      : normalizeBasis(proposal.paymentTemplate?.milestoneBasis)
  const hasManualMilestones = manualMilestones.length > 0
  const manualAmounts = hasManualMilestones
    ? computeMilestoneAmountsForBasis(manualMilestones, total, milestoneBasis)
    : []
  const manualPercentTotal = milestonesPercentTotal(manualMilestones)
  // In 'remaining' mode the upfront is row 0; the leftover pool funds the rest.
  const manualUpfront = manualAmounts[0] ?? 0
  const manualPool = Math.max(0, Math.round((total - manualUpfront) * 100) / 100)

  const paymentSchedule = hasManualMilestones
    ? null
    : computePaymentSchedule({
        paymentText: stripHtml(paymentHtml),
        total,
        engagementMonths,
        monthlyTotal,
        oneTimeTotal,
      })
  const scheduleShowsPercent =
    paymentSchedule?.installments.some((i) => i.percent !== null) ?? false
  const scheduleOneTime = paymentSchedule?.installments[0]?.oneTimeAmount ?? 0
  const scheduleDownpayment = paymentSchedule?.installments[0]?.downpaymentAmount ?? 0
  const scheduleDownpaymentPct = paymentSchedule?.installments[0]?.downpaymentPercent ?? 0

  // ── Section numbering (cover is 01; body sections continue the sequence) ────
  // Page numbers are no longer computed here — the body flows continuously and
  // Puppeteer's footer template stamps the real "Page X of Y" per physical page.
  const order: string[] = ['cover']
  if (nonOptionalItems.length > 0) order.push('scope')
  order.push('invest')
  if (paymentHtml || hasManualMilestones || hasModesOfPayment) order.push('payment')
  if (hasTc) order.push('tc')
  if (hasSignatories) order.push('signatories')
  const secNum = (key: string) => order.indexOf(key) + 1
  const pad = (n: number) => String(n).padStart(2, '0')

  // ── Flowing body section: numbered heading + content, no page chrome ────────
  function FlowSection({
    pageKey,
    title,
    children,
  }: {
    pageKey: string
    title: string
    children: React.ReactNode
  }) {
    return (
      <section className="flow-section">
        <div className="head">
          <div className="eyebrow">{pad(secNum(pageKey))}</div>
          <h2 className="section-title">{title}</h2>
        </div>
        <div className="section-body">{children}</div>
      </section>
    )
  }

  const css = `
    ${
      part === 'body'
        ? // Body pass: page size only — margins come from Puppeteer's pdf() options
          // (a CSS @page margin would override them and clip the footer template).
          `@page { size: A4; }`
        : `@page { size: A4; margin: 0; }`
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    #pdf-root {
      --primary: #1A1A2E;
      --accent: ${accent};
      --accent-light: #EEF2FF;
      --surface: #F8FAFC;
      --border: #E2E8F0;
      --muted: #64748B;
      --text: #1E293B;
      font-family: var(--font-sans, 'Inter', sans-serif);
      color: var(--text);
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      position: relative;
    }

    ${
      proposal.confidentialWatermark
        ? `#pdf-root::before {
      content: 'CONFIDENTIAL';
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 120px; font-weight: 800;
      color: rgba(26,26,46,0.04);
      letter-spacing: 0.12em; white-space: nowrap;
      pointer-events: none; z-index: 0;
    }`
        : ''
    }

    /* Cover: a fixed full-bleed A4 page (794×1123px at 96dpi) */
    .sheet { position: relative; z-index: 1; width: 794px; min-height: 1120px; background: #fff; }
    .sheet:not(:last-child) { break-after: page; page-break-after: always; }

    /* ── Continuous body flow ─────────────────────────────────────────────── */
    /* Width comes from the printable area (Puppeteer page margins); sections
       follow one another with a divider and break across pages naturally. */
    #doc-flow { position: relative; z-index: 1; background: #fff; }
    /* Browser preview only (?part absent): simulate the print margins */
    #doc-flow.preview-pad { width: 794px; padding: 52px 64px; }
    .flow-section + .flow-section { border-top: 1px solid var(--border); margin-top: 34px; padding-top: 30px; }

    /* Section head — never left alone at the bottom of a page */
    .head { break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; }
    .eyebrow { font-size: 12px; font-weight: 700; color: var(--accent); letter-spacing: 0.06em; }
    .section-title { font-size: 26px; font-weight: 700; color: var(--primary); line-height: 1.22; margin-top: 10px; }
    .section-body { margin-top: 22px; }

    /* Rich text */
    .rich { font-size: 12.5px; line-height: 1.7; color: var(--text); }
    .rich p { margin: 0 0 12px; }
    .rich h1, .rich h2, .rich h3, .rich h4 { color: var(--primary); font-weight: 600; margin: 18px 0 8px; line-height: 1.3; break-after: avoid; page-break-after: avoid; }
    .rich h1 { font-size: 18px; } .rich h2 { font-size: 16px; } .rich h3 { font-size: 14px; } .rich h4 { font-size: 12.5px; }
    .rich ul, .rich ol { margin: 0 0 12px; padding-left: 20px; }
    .rich li { margin: 4px 0; }
    .rich strong { font-weight: 600; color: var(--primary); }
    .rich em { font-style: italic; }
    .rich a { color: var(--accent); text-decoration: none; }
    .rich blockquote { border-left: 3px solid var(--border); padding-left: 14px; color: var(--muted); margin: 0 0 12px; }

    /* T&C compiled sections — long clauses may span pages, but a clause title
       always stays attached to the start of its body */
    .tc-section + .tc-section { border-top: 1px solid var(--border); margin-top: 18px; padding-top: 18px; }
    .tc-section-title { font-size: 14px; font-weight: 600; color: var(--primary); margin: 0 0 8px; line-height: 1.3; break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; }

    /* Signatories */
    .sig-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
    .sig-col-head { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin-bottom: 28px; break-after: avoid; page-break-after: avoid; }
    .sig-block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 40px; }
    .sig-mark { height: 64px; display: flex; align-items: flex-end; }
    .sig-mark img { max-height: 64px; max-width: 240px; object-fit: contain; }
    .sig-line { border-bottom: 1px solid var(--primary); width: 100%; margin-top: auto; }
    .sig-name { font-size: 13.5px; font-weight: 700; color: var(--primary); margin-top: 8px; }
    .sig-company { font-size: 12px; color: var(--text); margin-top: 2px; }
    .sig-position { font-size: 12px; color: var(--muted); margin-top: 2px; }

    /* Scope */
    .scope-item { break-inside: avoid; page-break-inside: avoid; margin-bottom: 22px; }
    .scope-item + .scope-item { border-top: 1px solid var(--border); padding-top: 22px; }
    .scope-head { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
    .scope-badge { width: 34px; height: 34px; border-radius: 9px; background: var(--accent-light); color: var(--accent); font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex: none; }
    .scope-name { font-size: 17px; font-weight: 600; color: var(--primary); flex: 1; }
    .tag { font-size: 9px; font-weight: 600; letter-spacing: 0.06em; color: var(--muted); border: 1px solid var(--border); background: var(--surface); border-radius: 999px; padding: 5px 11px; white-space: nowrap; }

    /* Tables: repeat column headers on page continuation, keep rows whole */
    .itable thead, .stable thead { display: table-header-group; }
    .itable tr, .stable tr { break-inside: avoid; page-break-inside: avoid; }

    /* Investment table */
    .itable { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .itable thead tr { border-bottom: 2px solid var(--primary); }
    .itable th { font-size: 10px; font-weight: 600; letter-spacing: 0.06em; color: var(--muted); text-transform: uppercase; padding: 0 0 10px; text-align: left; }
    .itable td { font-size: 12.5px; padding: 14px 0; vertical-align: top; border-bottom: 1px solid var(--border); color: var(--text); }
    .itable tbody tr:last-child td { border-bottom: 2px solid var(--primary); }
    /* Fixed column widths so the numeric columns never collide */
    .itable th:nth-child(1), .itable td:nth-child(1) { width: 26px; }
    .itable th:nth-child(3), .itable td:nth-child(3) { width: 116px; }
    .itable th:nth-child(4), .itable td:nth-child(4) { width: 120px; }
    .itable th:nth-child(5), .itable td:nth-child(5) { width: 132px; }
    .col-idx { color: var(--muted); }
    .col-num { text-align: right; white-space: nowrap; padding-left: 12px; }
    .li-name { font-weight: 600; color: var(--primary); }
    .li-sub { font-size: 11px; color: var(--muted); margin-top: 3px; }
    .amount { font-weight: 600; color: var(--primary); }

    /* Totals */
    .totals { display: flex; margin-top: 22px; break-inside: avoid; page-break-inside: avoid; }
    .totals-box { margin-left: auto; width: 330px; }
    .trow { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; font-size: 12.5px; }
    .trow .tl { color: var(--muted); }
    .trow .tv { color: var(--primary); font-weight: 500; }
    .trow.neg .tv { color: var(--muted); }
    .tdiv { border: 0; border-top: 1px solid var(--border); }
    .grand { display: flex; justify-content: space-between; align-items: center; background: var(--accent-light); border-radius: 12px; padding: 18px 20px; margin-top: 8px; }
    .grand .gl { font-size: 14px; font-weight: 600; color: var(--primary); }
    .grand .gv { font-size: 21px; font-weight: 700; color: var(--accent); }

    /* Payment schedule */
    .schedule { margin-top: 32px; break-inside: avoid; page-break-inside: avoid; }
    .schedule-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .schedule-title { font-size: 15px; font-weight: 600; color: var(--primary); }
    .stable { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .stable thead tr { border-bottom: 2px solid var(--primary); }
    .stable th { font-size: 10px; font-weight: 600; letter-spacing: 0.06em; color: var(--muted); text-transform: uppercase; padding: 0 0 10px; text-align: left; }
    .stable td { font-size: 12.5px; padding: 12px 0; vertical-align: top; border-bottom: 1px solid var(--border); color: var(--text); }
    .stable th:nth-child(1), .stable td:nth-child(1) { width: 26px; }
    .stable th:last-child, .stable td:last-child { width: 150px; }
    .stable tfoot td { border-bottom: 0; border-top: 2px solid var(--primary); padding-top: 12px; }
    .sched-label { color: var(--primary); font-weight: 500; }
    .sched-total-label { color: var(--primary); font-weight: 700; }
    .sched-basis { font-size: 10px; color: var(--muted); font-weight: 400; }
    .schedule-note { font-size: 11px; color: var(--muted); line-height: 1.6; margin-top: 14px; }

    /* Mode of payment (bank accounts) */
    .mop { margin-top: 32px; break-inside: avoid; page-break-inside: avoid; }
    .mop-head { margin-bottom: 14px; }
    .mop-title { font-size: 15px; font-weight: 600; color: var(--primary); }
    .mop-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .mop-card { border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; break-inside: avoid; }
    .mop-label { font-size: 12.5px; font-weight: 700; color: var(--primary); margin-bottom: 6px; }
    .mop-row { display: flex; gap: 6px; font-size: 11.5px; line-height: 1.7; }
    .mop-row .k { color: var(--muted); white-space: nowrap; }
    .mop-row .v { color: var(--text); }

    /* Optional add-ons */
    .addon-head { display: flex; align-items: center; justify-content: space-between; margin-top: 34px; margin-bottom: 14px; break-after: avoid; page-break-after: avoid; }
    .addon-title { font-size: 15px; font-weight: 600; color: var(--primary); }
    .lead-note { font-size: 12px; color: var(--muted); line-height: 1.6; margin-bottom: 24px; }

    /* Cover */
    .cover { background: var(--primary); color: #fff; }
    .cover-inner { min-height: 1120px; padding: 64px; display: flex; flex-direction: column; justify-content: space-between; position: relative; }
    .cover-bar { position: absolute; top: 64px; right: 64px; width: 220px; height: 8px; background: var(--accent); border-radius: 4px; }
    .logo-row { display: flex; align-items: center; gap: 16px; }
    .logo-mark { width: 52px; height: 52px; border-radius: 14px; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; color: #fff; flex: none; }
    .agency { font-size: 19px; font-weight: 600; }
    .cover-hero { margin-top: 150px; }
    .cover-pill { display: inline-flex; padding: 7px 14px; border-radius: 999px; background: var(--accent); font-size: 11px; font-weight: 600; letter-spacing: 0.08em; }
    .cover-title { font-size: 46px; font-weight: 700; line-height: 1.16; margin-top: 22px; }
    .cover-sub { font-size: 17px; opacity: 0.65; margin-top: 18px; }
    .cover-divider { border: 0; border-top: 1px solid rgba(255,255,255,0.15); }
    .cover-meta { display: flex; margin-top: 24px; }
    .cover-meta-col { flex: 1; }
    .cover-meta-col .l { font-size: 9px; font-weight: 600; letter-spacing: 0.06em; opacity: 0.5; text-transform: uppercase; }
    .cover-meta-col .v { font-size: 14px; font-weight: 500; margin-top: 6px; }
    .cover-confidential { font-size: 10px; opacity: 0.4; margin-top: 28px; }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div id="pdf-root">
        {/* ── 1. COVER (own full-bleed page, rendered without a footer) ──────── */}
        {showCover && (
        <section className="sheet cover">
          <div className="cover-inner">
            <div className="cover-bar" />

            <div>
              <div className="logo-row">
                <div className="logo-mark">{agencyName.charAt(0).toUpperCase()}</div>
                <div className="agency">{agencyName}</div>
              </div>

              <div className="cover-hero">
                <span className="cover-pill">PROPOSAL</span>
                <h1 className="cover-title">{proposal.projectTitle}</h1>
                <div className="cover-sub">Prepared for {proposal.clientName}</div>
              </div>
            </div>

            <div>
              <hr className="cover-divider" />
              <div className="cover-meta">
                <div className="cover-meta-col">
                  <div className="l">Proposal No.</div>
                  <div className="v">{proposal.number}</div>
                </div>
                <div className="cover-meta-col">
                  <div className="l">Date</div>
                  <div className="v">{fmtDate(proposal.date)}</div>
                </div>
                <div className="cover-meta-col">
                  <div className="l">Valid Until</div>
                  <div className="v">{fmtDate(proposal.validUntil)}</div>
                </div>
                <div className="cover-meta-col">
                  <div className="l">Prepared by</div>
                  <div className="v">{proposal.createdBy.name}</div>
                </div>
              </div>
              <div className="cover-confidential">
                Confidential — For Addressee Only · {agencyName}
              </div>
            </div>
          </div>
        </section>
        )}

        {/* ── BODY: sections flow continuously; breaks fall naturally ────────── */}
        {showBody && (
        <main id="doc-flow" className={part === 'all' ? 'preview-pad' : undefined}>

        {/* ── 3. SCOPE OF WORK ───────────────────────────────────────────────── */}
        {nonOptionalItems.length > 0 && (
          <FlowSection pageKey="scope" title="Scope of Work">
            {nonOptionalItems.map((li, i) => (
              <div key={li.id} className="scope-item">
                <div className="scope-head">
                  <div className="scope-badge">{pad(i + 1)}</div>
                  <div className="scope-name">{li.description}</div>
                  {li.service?.category && <span className="tag">{li.service.category}</span>}
                </div>
                {li.scopeOfWork && (
                  <div className="rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(li.scopeOfWork) }} />
                )}
              </div>
            ))}
          </FlowSection>
        )}

        {/* ── 4. INVESTMENT SUMMARY ──────────────────────────────────────────── */}
        <FlowSection pageKey="invest" title="Investment Summary">
          <div className="lead-note">
            All figures in {displayCurrency}
            {displayCurrency !== 'PHP' ? ', converted from Philippine Peso at the agreed rate' : ''}.
            {optionalItems.length > 0
              ? ' Optional add-ons are listed separately and are not included in the total below.'
              : ''}
          </div>

          <table className="itable">
            <thead>
              <tr>
                <th className="col-idx">#</th>
                <th>Service</th>
                <th className="col-num">Engagement</th>
                <th className="col-num">Rate</th>
                <th className="col-num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {nonOptionalItems.map((li, i) => (
                <tr key={li.id}>
                  <td className="col-idx">{i + 1}</td>
                  <td>
                    <div className="li-name">{li.description}</div>
                    {li.service?.category && <div className="li-sub">{li.service.category}</div>}
                  </td>
                  <td className="col-num">
                    {engagementLabel(li.unit)} · {li.quantity.toString()}
                  </td>
                  <td className="col-num">{money(li.unitRate.toString())}</td>
                  <td className="col-num amount">{money(li.lineTotal.toString())}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals">
            <div className="totals-box">
              <div className="trow">
                <span className="tl">Subtotal</span>
                <span className="tv">{money(subtotal)}</span>
              </div>
              {discountAmt > 0 && (
                <>
                  <hr className="tdiv" />
                  <div className="trow neg">
                    <span className="tl">
                      Discount
                      {proposal.discountType === 'percentage' ? ` (${proposal.discountValue}%)` : ''}
                    </span>
                    <span className="tv">−{money(discountAmt)}</span>
                  </div>
                </>
              )}
              {vatRate !== null && vatAmount !== null && (
                <>
                  <hr className="tdiv" />
                  <div className="trow">
                    <span className="tl">VAT ({vatRate}%)</span>
                    <span className="tv">{money(vatAmount)}</span>
                  </div>
                </>
              )}
              <div className="grand">
                <span className="gl">Grand Total</span>
                <span className="gv">{money(total)}</span>
              </div>
            </div>
          </div>

          {optionalItems.length > 0 && (
            <>
              <div className="addon-head">
                <span className="addon-title">Optional Add-ons</span>
                <span className="tag">NOT INCLUDED IN TOTAL</span>
              </div>
              <table className="itable">
                <thead>
                  <tr>
                    <th className="col-idx">#</th>
                    <th>Service</th>
                    <th className="col-num">Engagement</th>
                    <th className="col-num">Rate</th>
                    <th className="col-num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {optionalItems.map((li, i) => (
                    <tr key={li.id}>
                      <td className="col-idx">{i + 1}</td>
                      <td>
                        <div className="li-name">{li.description}</div>
                        {li.service?.category && <div className="li-sub">{li.service.category}</div>}
                      </td>
                      <td className="col-num">
                        {engagementLabel(li.unit)} · {li.quantity.toString()}
                      </td>
                      <td className="col-num">{money(li.unitRate.toString())}</td>
                      <td className="col-num amount">{money(li.lineTotal.toString())}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </FlowSection>

        {/* ── 5. PAYMENT TERMS ───────────────────────────────────────────────── */}
        {(paymentHtml || hasManualMilestones || hasModesOfPayment) && (
          <FlowSection pageKey="payment" title="Payment Terms">
            {paymentHtml && (
              <div className="rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(paymentHtml) }} />
            )}

            {hasManualMilestones && (
              <div className="schedule">
                <div className="schedule-head">
                  <span className="schedule-title">Payment Schedule</span>
                  <span className="tag">
                    {manualMilestones.length} milestone
                    {manualMilestones.length === 1 ? '' : 's'}
                  </span>
                </div>
                <table className="stable">
                  <thead>
                    <tr>
                      <th className="col-idx">#</th>
                      <th>Milestone</th>
                      <th>Due Date</th>
                      <th className="col-num">Share</th>
                      <th className="col-num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualMilestones.map((ms, i) => (
                      <tr key={i}>
                        <td className="col-idx">{i + 1}</td>
                        <td className="sched-label">{ms.label || `Milestone ${i + 1}`}</td>
                        <td className="sched-label">{ms.dueDate || '—'}</td>
                        <td className="col-num">
                          {ms.percent}%
                          {milestoneBasis === 'remaining' && (
                            <span className="sched-basis">
                              {i === 0 ? ' of total' : ' of remaining'}
                            </span>
                          )}
                        </td>
                        <td className="col-num amount">{money(manualAmounts[i])}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="col-idx" />
                      <td className="sched-total-label" colSpan={2}>
                        Total
                      </td>
                      <td className="col-num">
                        {milestoneBasis === 'remaining' ? '' : `${manualPercentTotal}%`}
                      </td>
                      <td className="col-num amount">{money(total)}</td>
                    </tr>
                  </tfoot>
                </table>
                <div className="schedule-note">
                  {milestoneBasis === 'remaining'
                    ? `The first milestone is billed as a share of the grand total of ${money(
                        total,
                      )}; the remaining ${money(
                        manualPool,
                      )} is split across the succeeding milestones.`
                    : `Milestone billing as a share of the grand total of ${money(total)}.`}
                </div>
              </div>
            )}

            {paymentSchedule && (
              <div className="schedule">
                <div className="schedule-head">
                  <span className="schedule-title">Payment Schedule</span>
                  <span className="tag">
                    {paymentSchedule.kind === 'monthly'
                      ? `${paymentSchedule.installments.length} monthly installments`
                      : `${paymentSchedule.installments.length} milestones`}
                  </span>
                </div>
                <table className="stable">
                  <thead>
                    <tr>
                      <th className="col-idx">#</th>
                      <th>{paymentSchedule.kind === 'monthly' ? 'Period' : 'Milestone'}</th>
                      {scheduleShowsPercent && <th className="col-num">Share</th>}
                      <th className="col-num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentSchedule.installments.map((inst, i) => (
                      <tr key={i}>
                        <td className="col-idx">{i + 1}</td>
                        <td className="sched-label">
                          {inst.label}
                          {inst.downpaymentAmount ? (
                            <div className="li-sub">
                              Includes {inst.downpaymentPercent}% downpayment of{' '}
                              {money(inst.downpaymentAmount)}
                            </div>
                          ) : inst.oneTimeAmount ? (
                            <div className="li-sub">
                              Includes one-time fee of {money(inst.oneTimeAmount)}
                            </div>
                          ) : null}
                        </td>
                        {scheduleShowsPercent && (
                          <td className="col-num">
                            {inst.percent !== null ? `${inst.percent}%` : '—'}
                          </td>
                        )}
                        <td className="col-num amount">{money(inst.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="col-idx" />
                      <td className="sched-total-label">Total</td>
                      {scheduleShowsPercent && <td className="col-num">100%</td>}
                      <td className="col-num amount">{money(paymentSchedule.total)}</td>
                    </tr>
                  </tfoot>
                </table>
                <div className="schedule-note">
                  {paymentSchedule.kind === 'monthly'
                    ? scheduleDownpayment > 0
                      ? `A ${scheduleDownpaymentPct}% downpayment of ${money(scheduleDownpayment)} is collected upfront with Month 1; the balance is billed evenly across the ${paymentSchedule.installments.length}-month engagement.`
                      : scheduleOneTime > 0
                        ? `A one-time fee of ${money(scheduleOneTime)} is billed upfront in Month 1; the recurring balance is spread evenly across the ${paymentSchedule.installments.length}-month engagement.`
                        : `Equal monthly installments across the ${paymentSchedule.installments.length}-month engagement, derived from the grand total of ${money(paymentSchedule.total)}.`
                    : `Milestone billing as a share of the grand total of ${money(paymentSchedule.total)}.`}
                </div>
              </div>
            )}

            {hasModesOfPayment && (
              <div className="mop">
                <div className="mop-head">
                  <span className="mop-title">Mode of Payment</span>
                </div>
                <div className="mop-grid">
                  {modesOfPayment.map((m) => (
                    <div key={m.id} className="mop-card">
                      <div className="mop-label">{m.label}</div>
                      <div className="mop-row">
                        <span className="k">Bank:</span>
                        <span className="v">{m.bankName}</span>
                      </div>
                      <div className="mop-row">
                        <span className="k">Account Name:</span>
                        <span className="v">{m.accountName}</span>
                      </div>
                      <div className="mop-row">
                        <span className="k">Account No.:</span>
                        <span className="v">{m.accountNumber}</span>
                      </div>
                      {m.branch && (
                        <div className="mop-row">
                          <span className="k">Branch:</span>
                          <span className="v">{m.branch}</span>
                        </div>
                      )}
                      {m.swiftCode && (
                        <div className="mop-row">
                          <span className="k">SWIFT Code:</span>
                          <span className="v">{m.swiftCode}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </FlowSection>
        )}

        {/* ── 6. TERMS & CONDITIONS ──────────────────────────────────────────── */}
        {hasTc && (
          <FlowSection pageKey="tc" title="Terms & Conditions">
            {tcSections.length > 0 ? (
              <div className="tc-sections">
                {tcSections.map((section, i) => (
                  <div key={`${section.tcTemplateId}-${i}`} className="tc-section">
                    <h3 className="tc-section-title">{section.name}</h3>
                    <div className="rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.html) }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(tcHtml) }} />
            )}
          </FlowSection>
        )}

        {/* ── 7. SIGNATORIES ─────────────────────────────────────────────────── */}
        {hasSignatories && (
          <FlowSection pageKey="signatories" title="Signatories">
            <div className="sig-cols">
              {internalSignatories.length > 0 && (
                <div className="sig-agency">
                  <div className="sig-col-head">For {agencyName}</div>
                  {internalSignatories.map((u) => (
                    <div key={u.id} className="sig-block">
                      <div className="sig-mark">
                        {u.signatureImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.signatureImageUrl} alt={`${u.name} signature`} />
                        ) : (
                          <div className="sig-line" />
                        )}
                      </div>
                      <div className="sig-name">{u.name}</div>
                      <div className="sig-company">{agencyName}</div>
                      {u.jobTitle && <div className="sig-position">{u.jobTitle}</div>}
                    </div>
                  ))}
                </div>
              )}
              {signatories.length > 0 && (
                <div className="sig-client">
                  <div className="sig-col-head">Conforme:</div>
                  {signatories.map((s, i) => (
                    <div key={i} className="sig-block">
                      <div className="sig-mark">
                        <div className="sig-line" />
                      </div>
                      <div className="sig-name">{s.name}</div>
                      <div className="sig-company">{s.companyName}</div>
                      <div className="sig-position">{s.position}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </FlowSection>
        )}

        </main>
        )}
      </div>
    </>
  )
}
