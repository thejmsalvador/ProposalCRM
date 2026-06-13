import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export type ImportRow = {
  name: string
  category: string
  description: string
  defaultScope?: string
  unit: string
  defaultRate: number
  internalNotes?: string | null
}

type ImportRequestBody = {
  rows: ImportRow[]
  filename: string
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }
  if (!can(session.user, 'manage:catalog')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  let body: ImportRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { rows, filename } = body
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
  }

  // Server-side re-validation
  const validRows: ImportRow[] = []
  const skippedRows: Array<{ row: ImportRow; reason: string }> = []

  // Check for duplicate names in DB
  const names = rows.map((r) => r.name).filter(Boolean)
  const existingActive = await prisma.service.findMany({
    where: { name: { in: names, mode: 'insensitive' }, isActive: true },
    select: { name: true },
  })
  const activeNameSet = new Set(existingActive.map((s) => s.name.toLowerCase()))

  for (const row of rows) {
    const errors: string[] = []

    if (!row.name || row.name.trim().length < 2) errors.push('Name must be at least 2 characters')
    if (!row.category || row.category.trim() === '') errors.push('Category is required')
    if (!row.description || row.description.trim() === '') errors.push('Description is required')
    if (!row.unit || row.unit.trim() === '') errors.push('Unit is required')
    if (row.defaultRate === undefined || row.defaultRate === null || isNaN(row.defaultRate) || row.defaultRate < 0) {
      errors.push('Default rate must be a non-negative number')
    }
    if (activeNameSet.has(row.name?.toLowerCase())) {
      errors.push(`A service named "${row.name}" already exists`)
    }

    if (errors.length > 0) {
      skippedRows.push({ row, reason: errors.join('; ') })
    } else {
      validRows.push(row)
    }
  }

  if (validRows.length > 0) {
    await prisma.service.createMany({
      data: validRows.map((row) => ({
        name: row.name.trim(),
        category: row.category.trim(),
        description: row.description.trim(),
        defaultScope: row.defaultScope?.trim() ?? '',
        unit: row.unit.trim(),
        defaultRate: row.defaultRate,
        internalNotes: row.internalNotes?.trim() || null,
        isActive: true,
      })),
    })
  }

  await logAudit('Service', 'batch', 'csv_import', session.user.id, {
    importedCount: validRows.length,
    skippedCount: skippedRows.length,
    filename: filename ?? 'unknown',
  })

  revalidatePath('/catalog')

  return NextResponse.json({
    imported: validRows.length,
    skipped: skippedRows.length,
    errors: skippedRows.map((s) => ({ name: s.row.name, reason: s.reason, row: s.row })),
  })
}
