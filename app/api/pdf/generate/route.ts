import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 60 // Vercel: 60-second timeout

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

  // ── Fetch proposal ────────────────────────────────────────────────────────
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { id: true, status: true, version: true },
  })

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

      const page = await browser.newPage()
      await page.goto(pdfUrl, { waitUntil: 'networkidle0', timeout: 30000 })
      await page.emulateMediaType('print')
      const buf = await page.pdf({
        format: 'A4',
        margin: { top: '15mm', right: '15mm', bottom: '20mm', left: '15mm' },
        printBackground: true,
      })
      await browser.close()
      pdfBuffer = Buffer.from(buf)
    } else {
      // Local dev: use bundled puppeteer
      const puppeteer = (await import('puppeteer')).default
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
      const page = await browser.newPage()
      await page.goto(pdfUrl, { waitUntil: 'networkidle0', timeout: 30000 })
      await page.emulateMediaType('print')
      const buf = await page.pdf({
        format: 'A4',
        margin: { top: '15mm', right: '15mm', bottom: '20mm', left: '15mm' },
        printBackground: true,
      })
      await browser.close()
      pdfBuffer = Buffer.from(buf)
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
