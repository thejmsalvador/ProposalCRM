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
import {
  DEFAULT_AGENCY_NAME,
  LEGAL_ENTITY_NAME,
  COMPANY_ADDRESS_LINES,
} from '@/lib/branding'

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

  const accent = settings?.brandColorHex ?? '#214ADE'
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

  // ── Cover derived values ─────────────────────────────────────────────────────
  // Hero title mirrors the Figma cover: "<Brand> - <Project Title>" when a brand
  // is set, otherwise just the project title.
  const coverTitle = proposal.brandName
    ? `${proposal.brandName} - ${proposal.projectTitle}`
    : proposal.projectTitle
  // "Prepared for" is the recipient contact; fall back to the company name when no
  // contact person was captured.
  const preparedForName = proposal.contactName || proposal.clientName
  // "Company" block — filter out any blank optional fields.
  const companyLines = [
    proposal.clientName,
    proposal.department,
    proposal.tin,
    proposal.businessAddress,
  ].filter((v): v is string => !!v)
  // Cover footer mirrors the inner-page running footer (built in the generate
  // route): legal entity / CE# / account code / company / project / year / grand
  // total. The cover is unnumbered, so the right side is just "Confidential".
  const coverFooterLabel = [
    LEGAL_ENTITY_NAME,
    proposal.number,
    proposal.accountCode,
    proposal.clientName,
    proposal.projectTitle,
    new Date(proposal.date).getFullYear(),
    money(total),
  ]
    .filter(Boolean)
    .join(' / ')

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

    /* ── One section per page ─────────────────────────────────────────────── */
    /* Width comes from the printable area (Puppeteer page margins). Each section
       starts on a fresh page; a section longer than one page still paginates
       naturally (Puppeteer stamps real "Page X of Y" in the footer either way). */
    #doc-flow { position: relative; z-index: 1; background: #fff; }
    /* Browser preview only (?part absent): simulate the print margins */
    #doc-flow.preview-pad { width: 794px; padding: 52px 64px; }
    /* The cover (body pass) / first section already starts at the top of the body
       render, so only break BEFORE each subsequent section. */
    .flow-section + .flow-section { break-before: page; page-break-before: always; }

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
    /* The element-level 'itable th' / 'stable th' rules set text-align:left and
       out-specify 'col-num'; re-assert right alignment for number-column headers. */
    .itable th.col-num, .stable th.col-num { text-align: right; }
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

    /* ── Cover (Figma node 23:9 — full-bleed brand-blue title page) ─────────── */
    .cover { background: var(--accent); color: #fff; }
    .cover-inner { min-height: 1123px; padding: 60px 64px; display: flex; flex-direction: column; position: relative; overflow: hidden; }
    /* Faint brand swoosh watermark */
    .cover-watermark { position: absolute; top: 128px; left: -60px; width: 697px; height: 698px; pointer-events: none; z-index: 0; }
    .cover-inner > *:not(.cover-watermark) { position: relative; z-index: 1; }

    /* Header: wordmark left, registered-address block right */
    .cover-head { display: flex; justify-content: space-between; align-items: flex-start; }
    .cover-logo { width: 124px; height: 59px; flex: none; }
    .cover-address { text-align: right; font-size: 12px; line-height: 1.5; color: rgba(255,255,255,0.65); }

    /* Hero */
    .cover-hero { margin-top: 258px; }
    .cover-pill { display: inline-flex; align-items: center; padding: 7px 14px; border-radius: 999px; background: #fff; color: var(--accent); font-size: 11px; font-weight: 800; letter-spacing: 0.08em; }
    .cover-title { font-size: 46px; font-weight: 700; line-height: 1.17; margin-top: 22px; max-width: 666px; }

    /* Recipient + company */
    .cover-parties { margin-top: 40px; display: flex; flex-direction: column; gap: 24px; }
    .cover-flabel { font-size: 9px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.5; }
    .cover-fvalue { font-size: 14px; font-weight: 500; line-height: 1.5; margin-top: 6px; }

    /* Bottom cluster (anchored to the page foot) */
    .cover-bottom { margin-top: auto; }
    .cover-total .cover-fvalue { font-size: 24px; font-weight: 700; }
    .cover-meta { display: grid; grid-template-columns: 225px 1fr; gap: 20px 0; margin-top: 34px; }

    /* Footer — mirrors the inner-page running footer */
    .cover-footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 40px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 8px; color: rgba(255,255,255,0.6); }
    .cover-footer .fl { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .cover-footer .fr { white-space: nowrap; flex-shrink: 0; }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div id="pdf-root">
        {/* ── 1. COVER (own full-bleed page, rendered without a footer) ──────── */}
        {showCover && (
        <section className="sheet cover">
          <div className="cover-inner">
            {/* Faint brand swoosh watermark */}
            <svg
              className="cover-watermark"
              viewBox="0 0 697 698"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M683.406 249.662C590.526 368.25 474.191 371.767 474.191 371.767C309.173 398.216 247.862 315.298 291.782 263.371C322.936 236.203 383.859 250.272 414.376 347.618C474.246 357.366 569.397 322.665 613.095 288.158C617.747 269.713 613.095 131.213 497.092 53.0589C365.499 -35.5913 182.647 -3.82569 90.5703 79.7564C8.07512 154.642 -69.1031 327.733 104.001 459.642C231.828 557.044 422.628 484.29 442.843 473.988C445.585 472.575 447.551 554.745 402.191 572.968C336.09 599.527 303.108 539.264 303.108 539.264C303.108 539.264 228.671 564.577 185.832 578.396C230.859 691.667 367.327 706.428 414.791 694.63C558.597 658.904 607.335 547.185 610.714 411.703C653.47 373.651 678.587 308.153 696.532 256.724C699.357 248.61 688.695 242.877 683.378 249.635"
                fill="#fff"
                fillOpacity="0.05"
              />
            </svg>

            {/* Header: wordmark + registered address */}
            <div className="cover-head">
              <svg
                className="cover-logo"
                viewBox="0 0 124 59"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                role="img"
                aria-label={agencyName}
              >
                <g fill="#fff">
                  <path d="M5.63547 20.6197C5.82043 22.2618 6.79247 22.9746 9.10648 22.9746C10.7475 22.9746 11.6054 22.6753 11.6054 21.7775C11.6054 20.9544 11.0466 20.6945 7.94948 19.8714C3.80552 18.7885 0.932686 17.1463 0.932686 13.1846C0.932686 9.22293 3.91964 6.79709 8.95693 6.79709C14.4074 6.79709 17.3196 9.56161 17.3196 13.2594H11.6842C11.5346 12.0623 10.5626 11.3928 9.03564 11.3928C7.72909 11.3928 7.0955 11.8024 7.0955 12.5112C7.0955 13.4091 7.69368 13.7084 10.901 14.4921C15.6392 15.6498 17.8824 17.6307 17.8824 21.2143C17.8824 24.798 14.5609 27.5625 9.14977 27.5625C3.73861 27.5625 0.149545 25.2508 0 20.6197H5.63547Z" />
                  <path d="M31.8412 27.1175V22.6714C30.759 25.6604 28.3702 27.5664 25.2337 27.5664C21.6131 27.5664 19.4841 25.0618 19.4841 20.6197V7.24603H26.5009V18.2647C26.5009 21.0647 27.3588 22.2225 29.0392 22.2225C30.7196 22.2225 31.7625 21.0647 31.7625 18.2647V7.24603H38.7793V27.1175H31.8373H31.8412Z" />
                  <path d="M48.3383 7.24603V11.8024C49.4599 8.73855 51.9943 6.79709 55.1702 6.79709C58.7907 6.79709 60.9197 9.3017 60.9197 13.7438V27.1175H53.903V16.0988C53.903 13.2988 52.8955 12.141 51.2151 12.141C49.5347 12.141 48.417 13.2988 48.417 16.0988V27.1175H41.4002V7.24603H48.3423H48.3383Z" />
                  <path d="M76.5589 27.1175V22.6714C75.701 25.4714 73.3477 27.5664 70.2505 27.5664C66.4057 27.5664 62.9346 24.2781 62.9346 17.1818C62.9346 10.0854 66.4804 6.79709 70.2151 6.79709C73.0132 6.79709 75.4767 8.77793 76.4881 11.5425V0H83.5049V27.1175H76.5629H76.5589ZM70.3253 17.1818C70.3253 20.8402 71.9309 22.2225 73.6113 22.2225C75.2918 22.2225 76.5589 20.9899 76.5589 17.8512V16.5083C76.5589 13.3697 75.2524 12.1371 73.6113 12.1371C71.9703 12.1371 70.3253 13.5194 70.3253 17.1778V17.1818Z" />
                  <path d="M97.1253 27.1175C96.8262 26.1093 96.6412 25.1012 96.6019 23.6441C95.8187 25.9242 94.0635 27.5664 91.2261 27.5664C88.0542 27.5664 85.6654 25.5501 85.6654 21.8877C85.6654 18.2253 88.5028 16.1342 93.5401 15.2403L96.5271 14.7165V14.1179C96.5271 12.4758 95.9289 11.6133 94.3626 11.6133C92.7963 11.6133 92.1982 12.2867 92.1234 14.3385H86.0393C86.1888 9.18355 88.8374 6.79315 95.0356 6.79315C101.234 6.79315 103.473 9.48285 103.473 14.5629V21.5491C103.473 24.0143 103.697 25.7707 104.071 27.1135H97.1292L97.1253 27.1175ZM94.5122 22.8211C95.8935 22.8211 96.6019 22.0374 96.6019 19.3477V18.1151L94.886 18.375C93.3198 18.5995 92.4579 19.4579 92.4579 20.8048C92.4579 22.1516 93.1663 22.8211 94.5122 22.8211Z" />
                  <path d="M108.436 34.3281C106.755 34.3281 105.598 34.2178 104.555 34.0682V28.9881H107.204C109.258 28.9881 110.266 28.2044 110.86 26.448L103.32 7.24997H110.671L112.092 11.5818C112.69 13.413 113.433 15.8034 114.071 18.119L117.208 7.24997H124L117.357 26.448C115.452 31.9377 112.914 34.3281 108.436 34.3281Z" />
                  <path d="M5.63547 52.0533C5.82043 53.6954 6.79247 54.4082 9.10648 54.4082C10.7475 54.4082 11.6054 54.1089 11.6054 53.211C11.6054 52.388 11.0466 52.1281 7.94948 51.305C3.80552 50.2221 0.932686 48.5799 0.932686 44.6182C0.932686 40.6565 3.91964 38.2307 8.95693 38.2307C14.4074 38.2307 17.3196 40.9952 17.3196 44.693H11.6842C11.5346 43.4959 10.5626 42.8264 9.03564 42.8264C7.72909 42.8264 7.0955 43.2359 7.0955 43.9487C7.0955 44.8466 7.69368 45.1459 10.901 45.9296C15.6392 47.0874 17.8824 49.0682 17.8824 52.6518C17.8824 56.2355 14.5609 59 9.14977 59C3.73861 59 0.149545 56.6844 0 52.0533H5.63547Z" />
                  <path d="M26.4654 59C23.0299 59 20.6411 57.094 20.6411 53.5103V43.7243H19.0748V38.6835H20.6411V35.0212H27.6579V38.6835H30.9793V43.7243H27.6579V51.754C27.6579 53.1717 28.3308 53.6954 29.7476 53.6954H30.9793V58.5511C29.9325 58.811 28.2167 59 26.4615 59H26.4654Z" />
                  <path d="M45.3907 58.5511V54.105C44.3085 57.094 41.9197 59 38.7832 59C35.1627 59 33.0336 56.4954 33.0336 52.0533V38.6796H40.0504V49.6983C40.0504 52.4983 40.9083 53.6561 42.5887 53.6561C44.2691 53.6561 45.312 52.4983 45.312 49.6983V38.6796H52.3288V58.5511H45.3868H45.3907Z" />
                  <path d="M67.3383 58.5511V54.105C66.4804 56.905 64.1271 59 61.0299 59C57.1851 59 53.714 55.7117 53.714 48.6153C53.714 41.519 57.2598 38.2307 60.9945 38.2307C63.7926 38.2307 66.2561 40.2115 67.2636 42.976V31.4336H74.2804V58.5511H67.3383ZM61.1047 48.6153C61.1047 52.2738 62.7103 53.6561 64.3907 53.6561C66.0711 53.6561 67.3383 52.4234 67.3383 49.2848V47.938C67.3383 44.7994 66.0318 43.5667 64.3907 43.5667C62.7497 43.5667 61.1047 44.949 61.1047 48.6075V48.6153Z" />
                  <path d="M83.9103 31.5084V37.1123H76.8935V31.5084H83.9103ZM83.9103 38.6796V58.5511H76.8935V38.6796H83.9103Z" />
                  <path d="M96.4917 38.2307C102.241 38.2307 107.019 42.1884 107.019 48.6153C107.019 55.0422 102.241 59 96.4917 59C90.7421 59 85.9645 55.0422 85.9645 48.6153C85.9645 42.1884 90.7421 38.2307 96.4917 38.2307ZM96.4917 53.7348C98.2823 53.7348 99.6282 52.4274 99.6282 48.6193C99.6282 44.8112 98.2823 43.5037 96.4917 43.5037C94.7011 43.5037 93.3552 44.8112 93.3552 48.6193C93.3552 52.4274 94.6971 53.7348 96.4917 53.7348Z" />
                </g>
              </svg>
              <div className="cover-address">
                {COMPANY_ADDRESS_LINES.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>

            {/* Hero */}
            <div className="cover-hero">
              <span className="cover-pill">COST PROPOSAL</span>
              <h1 className="cover-title">{coverTitle}</h1>
            </div>

            {/* Recipient + company */}
            <div className="cover-parties">
              <div>
                <div className="cover-flabel">Prepared For</div>
                <div className="cover-fvalue">
                  {preparedForName}
                  {proposal.contactTitle && (
                    <>
                      <br />
                      {proposal.contactTitle}
                    </>
                  )}
                </div>
              </div>
              {companyLines.length > 0 && (
                <div>
                  <div className="cover-flabel">Company</div>
                  <div className="cover-fvalue">
                    {companyLines.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom cluster */}
            <div className="cover-bottom">
              <div className="cover-total">
                <div className="cover-flabel">Total Investment</div>
                <div className="cover-fvalue">{money(total)}</div>
              </div>

              <div className="cover-meta">
                <div>
                  <div className="cover-flabel">Cost Estimate No.</div>
                  <div className="cover-fvalue">{proposal.number}</div>
                </div>
                <div>
                  <div className="cover-flabel">Date Created</div>
                  <div className="cover-fvalue">{fmtDate(proposal.date)}</div>
                </div>
                <div>
                  <div className="cover-flabel">Prepared By</div>
                  <div className="cover-fvalue">{proposal.createdBy.name}</div>
                </div>
                <div>
                  <div className="cover-flabel">Valid Until</div>
                  <div className="cover-fvalue">{fmtDate(proposal.validUntil)}</div>
                </div>
              </div>

              <div className="cover-footer">
                <span className="fl">{coverFooterLabel}</span>
                <span className="fr">Confidential</span>
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
