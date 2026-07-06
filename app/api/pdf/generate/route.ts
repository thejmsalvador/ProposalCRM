import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { PDFDocument } from 'pdf-lib'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

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
  footer: { proposalNumber: string; agencyName: string },
): Promise<Buffer> {
  await page.goto(`${pdfUrl}&part=cover`, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.emulateMediaType('print')
  const coverBuf = await page.pdf({
    printBackground: true,
    // Full bleed: the cover's @page rule is A4 with zero margins.
    preferCSSPageSize: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  })

  const footerTemplate = `
    <div style="width:100%; margin:0 15mm; padding-top:6px; border-top:1px solid #E2E8F0; font-size:8px; font-family:Helvetica,Arial,sans-serif; color:#64748B; display:flex; justify-content:space-between; align-items:center;">
      <span>${escapeHtml(footer.proposalNumber)}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      <span>${escapeHtml(footer.agencyName)} &nbsp;·&nbsp; Confidential — For Addressee Only</span>
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

  // ── Input ─────────────────────────────────────────────────────────────────
  let proposalId: string
  try {
    const body = await req.json()
    proposalId = body.proposalId
    if (!proposalId || typeof proposalId !== 'string') throw new Error()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // ── Fetch proposal (+ agency name for the running footer) ────────────────
  const [proposal, settings] = await Promise.all([
    prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, status: true, version: true, number: true },
    }),
    prisma.systemSettings.findFirst({ select: { agencyName: true } }),
  ])

  if (!proposal) {
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

  // ── Generate signed token for the PDF template URL ────────────────────────
  const token = createHmac('sha256', secret).update(proposalId).digest('hex')
  const pdfUrl = `${appUrl}/pdf/${proposalId}?token=${token}`
  const footer = {
    proposalNumber: proposal.number,
    agencyName: settings?.agencyName ?? 'The Agency',
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
  const { data: signedData, error: signedError } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(storagePath, 60 * 60 * 24)

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
