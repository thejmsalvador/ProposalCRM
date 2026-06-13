import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import * as XLSX from 'xlsx'

const HEADERS = [
  'name',
  'category',
  'description',
  'defaultScope',
  'unit',
  'defaultRate',
  'internalNotes',
]

const INSTRUCTIONS = [
  'Required. Service display name.',
  'Required. E.g. Strategy, Creative, Digital, Production, Media',
  'Required. One-line description shown on proposals.',
  'Recommended. Full scope text pre-filled in proposals.',
  'Required. E.g. lump sum, per month, per asset, per campaign',
  'Required. Number only, no currency symbol. E.g. 85000',
  'Optional. Internal only, never shown on proposals.',
]

const EXAMPLE_ROWS = [
  [
    'Brand Strategy Workshop',
    'Strategy',
    'Full-day brand strategy session with stakeholders',
    'Facilitated workshop covering brand positioning, values, and messaging framework.',
    'lump sum',
    85000,
    '',
  ],
  [
    'Social Media Management',
    'Digital',
    'Monthly social media content creation and scheduling',
    'Includes content calendar, 12 posts per month across 2 platforms, community management.',
    'per month',
    35000,
    '',
  ],
  [
    'TVC Production',
    'Production',
    'End-to-end TV commercial production',
    'Pre-production planning, shoot day, post-production including color grading and audio mix.',
    'per project',
    250000,
    'Excludes talent and location fees',
  ],
]

function escapeCSV(value: string | number): string {
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }
  if (!can(session.user, 'manage:catalog')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') ?? 'csv'

  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new()
    const ws: XLSX.WorkSheet = {}

    const colWidths = [30, 20, 40, 50, 20, 15, 40]

    // Row 1: headers (bold, gray fill)
    HEADERS.forEach((h, ci) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci })
      ws[cellRef] = {
        v: h,
        t: 's',
        s: {
          font: { bold: true },
          fill: { fgColor: { rgb: 'F1F5F9' } },
          alignment: { horizontal: 'left' },
        },
      }
    })

    // Row 2: instructions (italic, yellow fill)
    INSTRUCTIONS.forEach((inst, ci) => {
      const cellRef = XLSX.utils.encode_cell({ r: 1, c: ci })
      ws[cellRef] = {
        v: inst,
        t: 's',
        s: {
          font: { italic: true },
          fill: { fgColor: { rgb: 'FEFCE8' } },
          alignment: { horizontal: 'left', wrapText: true },
        },
      }
    })

    // Rows 3-5: example data
    EXAMPLE_ROWS.forEach((row, ri) => {
      row.forEach((val, ci) => {
        const cellRef = XLSX.utils.encode_cell({ r: ri + 2, c: ci })
        const isNum = typeof val === 'number'
        ws[cellRef] = {
          v: val,
          t: isNum ? 'n' : 's',
        }
      })
    })

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 4, c: 6 } })
    ws['!cols'] = colWidths.map((w) => ({ wch: w }))

    XLSX.utils.book_append_sheet(wb, ws, 'Services')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="service-catalog-template.xlsx"',
        'Cache-Control': 'no-store',
      },
    })
  }

  // CSV
  const lines: string[] = [
    HEADERS.join(','),
    ...EXAMPLE_ROWS.map((row) => row.map(escapeCSV).join(',')),
  ]
  const csv = lines.join('\n')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="service-catalog-template.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
