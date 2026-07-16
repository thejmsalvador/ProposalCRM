import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { canViewProposal } from '@/lib/proposal-visibility'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { signPdfToken, proposalPdfFilename } from '@/lib/pdf-token'
import { rateLimit } from '@/lib/rate-limit'
import { formatCurrency } from '@/lib/validations/proposals'
import { LEGAL_ENTITY_NAME } from '@/lib/branding'

export const maxDuration = 60 // Vercel: 60-second timeout

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Minimal structural page type shared by `puppeteer` and `puppeteer-core`.
type PdfCapablePage = {
  goto: (url: string, opts: { waitUntil: 'networkidle0'; timeout: number }) => Promise<unknown>
  emulateMediaType: (type: string) => Promise<unknown>
  pdf: (opts: Record<string, unknown>) => Promise<Uint8Array>
}

// Renders the proposal in two passes and merges them:
//   1. cover  — full-bleed A4 page, zero margins, no footer (unnumbered)
//   2. body   — continuous flow with page margins + a running footer whose
//               "Page X of Y" comes from Puppeteer's own pagination
async function renderProposalPdf(
  page: PdfCapablePage,
  pdfUrl: string,
  footer: { label: string },
): Promise<Buffer> {
  await page.goto(`${pdfUrl}&part=cover`, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.emulateMediaType('print')
  const coverBuf = await page.pdf({
    printBackground: true,
    // Full bleed: the cover's @page rule is A4 with zero margins.
    preferCSSPageSize: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  })

  // Running footer: descriptive document label on the left, page numbers hard
  // against the right edge. The label ellipsizes so a long project title can't
  // collide with the page count.
  const footerTemplate = `
    <div style="width:100%; margin:0 15mm; padding-top:6px; border-top:1px solid #E2E8F0; font-size:8px; font-family:Helvetica,Arial,sans-serif; color:#64748B; display:flex; justify-content:space-between; align-items:center; gap:16px;">
      <span style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${escapeHtml(footer.label)}</span>
      <span style="white-space:nowrap; flex-shrink:0;">Confidential - Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`

  await page.goto(`${pdfUrl}&part=body`, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.emulateMediaType('print')
  const bodyBuf = await page.pdf({
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate,
    // Option margins define the printable area and the footer band; the body's
    // CSS deliberately sets no @page margin so these win.
    margin: { top: '16mm', right: '15mm', bottom: '20mm', left: '15mm' },
  })

  const merged = await PDFDocument.create()
  for (const buf of [coverBuf, bodyBuf]) {
    const doc = await PDFDocument.load(buf)
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    for (const p of pages) merged.addPage(p)
  }
  return Buffer.from(await merged.save())
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!can(session.user, 'create:proposal')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  // Puppeteer rendering is resource-heavy; cap per user to blunt DoS abuse.
  const limit = rateLimit(`pdf:${session.user.id}`, 10, 60 * 1000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many PDF requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  let proposalId: string
  try {
    const body = await req.json()
    proposalId = body.proposalId
    if (!proposalId || typeof proposalId !== 'string') throw new Error()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // ── Fetch proposal (+ the fields the running-footer label is built from) ──
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      status: true,
      version: true,
      number: true,
      accountCode: true,
      clientName: true,
      projectTitle: true,
      date: true,
      total: true,
      currency: true,
      exchangeRate: true,
      createdById: true,
      createdBy: { select: { teamId: true } },
    },
  })

  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }
  // Scope to the caller's visibility (SALES_EXEC → own, SALES_MANAGER → team)
  // so a user cannot render a proposal they aren't allowed to see.
  if (!canViewProposal(session.user, proposal)) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }
  if (proposal.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'PDF can only be generated for APPROVED proposals' },
      { status: 422 },
    )
  }

  const secret = process.env.PDF_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'PDF_SECRET not configured' }, { status: 500 })
  }

  const bucketName = process.env.STORAGE_BUCKET_NAME ?? 'proposals'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // ── Generate signed, short-lived token for the PDF template URL ──────────
  const token = signPdfToken(proposalId, secret)
  const pdfUrl = `${appUrl}/pdf/${proposalId}?token=${encodeURIComponent(token)}`

  // Footer label: Legal Entity / CE# / Account Code / Company Name / Project
  // Title / Year / Grand Total. The grand total mirrors the PDF body — converted
  // to the client currency at the proposal's FX rate (₱ per unit), or left in ₱
  // when there is no rate. Account code is a required proposal field, so it's
  // always present; the filter() only guards legacy proposals created before it
  // became mandatory.
  const totalPhp = parseFloat(proposal.total.toString())
  const fxRate =
    proposal.currency !== 'PHP' && proposal.exchangeRate
      ? parseFloat(proposal.exchangeRate.toString())
      : null
  const displayCurrency = fxRate && fxRate > 0 ? proposal.currency : 'PHP'
  const grandTotal = formatCurrency(
    fxRate && fxRate > 0 ? totalPhp / fxRate : totalPhp,
    displayCurrency,
  )
  const footer = {
    label: [
      LEGAL_ENTITY_NAME,
      proposal.number,
      proposal.accountCode,
      proposal.clientName,
      proposal.projectTitle,
      new Date(proposal.date).getFullYear(),
      grandTotal,
    ]
      .filter(Boolean)
      .join(' / '),
  }

  // ── Launch Puppeteer ──────────────────────────────────────────────────────
  let pdfBuffer: Buffer

  try {
    // Use @sparticuz/chromium-min on Vercel, regular puppeteer locally
    if (process.env.VERCEL) {
      const chromium = (await import('@sparticuz/chromium-min')).default
      const puppeteer = (await import('puppeteer-core')).default

      const executablePath = await chromium.executablePath(
        `https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar`,
      )

      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1200, height: 900 },
        executablePath,
        headless: true,
      })
      try {
        const page = await browser.newPage()
        pdfBuffer = await renderProposalPdf(page, pdfUrl, footer)
      } finally {
        await browser.close()
      }
    } else {
      // Local dev: use bundled puppeteer
      const puppeteer = (await import('puppeteer')).default
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
      try {
        const page = await browser.newPage()
        pdfBuffer = await renderProposalPdf(page, pdfUrl, footer)
      } finally {
        await browser.close()
      }
    }
  } catch (err) {
    console.error('[pdf/generate] Puppeteer error:', err)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }

  // ── Upload to Supabase Storage ────────────────────────────────────────────
  const storagePath = `proposals/${proposalId}/v${proposal.version}.pdf`
  const supabase = getSupabaseAdmin()

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    console.error('[pdf/generate] Supabase upload error:', uploadError)
    return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })
  }

  // ── Get signed URL (24 h) ─────────────────────────────────────────────────
  // Client-facing download filename: "CE# - Account Code - Project Title - vN".
  const downloadName = proposalPdfFilename(proposal)

  const { data: signedData, error: signedError } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(storagePath, 60 * 60 * 24, { download: downloadName })

  if (signedError || !signedData?.signedUrl) {
    console.error('[pdf/generate] Signed URL error:', signedError)
    return NextResponse.json({ error: 'Could not create signed URL' }, { status: 500 })
  }

  const signedUrl = signedData.signedUrl

  // ── Update ProposalVersion.pdfUrl ─────────────────────────────────────────
  await prisma.proposalVersion.updateMany({
    where: { proposalId, versionNumber: proposal.version },
    data: { pdfUrl: signedUrl },
  })

  return NextResponse.json({ url: signedUrl })
}
