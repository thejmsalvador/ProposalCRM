import { NextRequest, NextResponse } from 'next/server'
import archiver from 'archiver'
import { PassThrough } from 'stream'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { proposalPdfFilename } from '@/lib/pdf-token'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!can(session.user, 'manage:templates')) {
    // manage:templates is the closest ADMIN+ gate; bulk download is admin-only
    return NextResponse.json({ error: 'Forbidden — Admin only' }, { status: 403 })
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  let proposalIds: string[]
  try {
    const body = await req.json()
    proposalIds = body.proposalIds
    if (!Array.isArray(proposalIds) || proposalIds.length === 0) throw new Error()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // ── Fetch latest pdfUrl for each proposal ─────────────────────────────────
  const proposals = await prisma.proposal.findMany({
    where: { id: { in: proposalIds } },
    select: {
      id: true,
      number: true,
      accountCode: true,
      projectTitle: true,
      version: true,
      versions: {
        where: { pdfUrl: { not: null } },
        orderBy: { versionNumber: 'desc' },
        take: 1,
        select: { pdfUrl: true },
      },
    },
  })

  const supabase = getSupabaseAdmin()
  const bucket = process.env.STORAGE_BUCKET_NAME ?? 'proposals'

  // ── Download each PDF and buffer it ───────────────────────────────────────
  type PdfEntry = { filename: string; buffer: Buffer }
  const pdfEntries: PdfEntry[] = []
  const missing: string[] = []

  await Promise.all(
    proposals.map(async (proposal) => {
      const pdfUrl = proposal.versions[0]?.pdfUrl
      if (!pdfUrl) {
        missing.push(proposal.number)
        return
      }

      // Extract the storage path from the URL
      // pdfUrl is a signed URL; extract the object path from its `path` query param
      // or fall back to parsing the URL
      let storagePath: string
      try {
        const url = new URL(pdfUrl)
        // Supabase signed URLs have the path in the URL path segment
        // e.g. /storage/v1/object/sign/proposals/abc/v1.pdf?token=...
        const match = url.pathname.match(/\/storage\/v1\/object\/sign\/[^/]+\/(.+)$/)
        if (match) {
          storagePath = match[1]
        } else {
          // Try extracting from /object/authenticated/bucket/path
          const match2 = url.pathname.match(/\/storage\/v1\/object\/(?:authenticated|public)\/[^/]+\/(.+)$/)
          storagePath = match2 ? match2[1] : ''
        }
      } catch {
        missing.push(proposal.number)
        return
      }

      if (!storagePath) {
        missing.push(proposal.number)
        return
      }

      const { data, error } = await supabase.storage
        .from(bucket)
        .download(storagePath)

      if (error || !data) {
        missing.push(proposal.number)
        return
      }

      const arrayBuffer = await data.arrayBuffer()
      pdfEntries.push({
        filename: proposalPdfFilename(proposal),
        buffer: Buffer.from(arrayBuffer),
      })
    }),
  )

  if (pdfEntries.length === 0) {
    return NextResponse.json(
      { error: 'No PDFs available for the selected proposals. Generate PDFs first.' },
      { status: 422 },
    )
  }

  // ── Build ZIP with archiver ────────────────────────────────────────────────
  const passThrough = new PassThrough()
  const chunks: Buffer[] = []

  passThrough.on('data', (chunk: Buffer) => chunks.push(chunk))

  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.pipe(passThrough)

  for (const entry of pdfEntries) {
    archive.append(entry.buffer, { name: entry.filename })
  }

  await archive.finalize()

  // Wait for passThrough to finish
  await new Promise<void>((resolve, reject) => {
    passThrough.on('end', resolve)
    passThrough.on('error', reject)
  })

  const zipBuffer = Buffer.concat(chunks)

  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="proposals-${new Date().toISOString().split('T')[0]}.zip"`,
      'Content-Length': String(zipBuffer.length),
    },
  })
}
