'use client'

import { useState, useRef, useCallback, useTransition } from 'react'
import Papa from 'papaparse'
import { Upload, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, FileText, Download } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { checkDuplicateServiceNames } from '@/lib/actions/catalog'
import type { ImportRow } from '@/app/api/catalog/import/route'

// ─── Types ────────────────────────────────────────────────────────────────────

type RowStatus = 'ready' | 'warning' | 'error'

type ParsedRow = {
  index: number
  raw: Record<string, string>
  name: string
  category: string
  description: string
  defaultScope: string
  unit: string
  defaultRate: number | null
  minRate: number | null
  maxRate: number | null
  internalNotes: string
  status: RowStatus
  errors: string[]
  warnings: string[]
}

type ImportStep = 'upload' | 'preview' | 'result'

type ImportResult = {
  imported: number
  skipped: number
  errors: Array<{ name: string; reason: string; row: ImportRow }>
}

const REQUIRED_HEADERS = ['name', 'category', 'description', 'unit', 'defaultrate']
const MAX_ROWS = 200
const MAX_FILE_BYTES = 2 * 1024 * 1024

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportCsvSheet({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<ImportStep>('upload')
  const [isDragging, setIsDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [importing, startImporting] = useTransition()
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep('upload')
    setFileError(null)
    setFilename('')
    setParsedRows([])
    setCheckingDuplicates(false)
    setExpandedRows(new Set())
    setImportResult(null)
  }

  function handleClose(open: boolean) {
    if (!open) reset()
    onOpenChange(open)
  }

  // ─── File handling ───────────────────────────────────────────────────────

  function handleFile(file: File) {
    setFileError(null)

    if (!file.name.endsWith('.csv')) {
      setFileError('Only .csv files are accepted.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError('File exceeds the 2MB limit.')
      return
    }

    setFilename(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      parseCSV(text)
    }
    reader.onerror = () => {
      setFileError('Could not read this file. Make sure it is a valid CSV and try again.')
    }
    reader.readAsText(file)
  }

  function parseCSV(text: string) {
    let result: Papa.ParseResult<Record<string, string>>
    try {
      result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      })
    } catch {
      setFileError('Could not read this file. Make sure it is a valid CSV and try again.')
      return
    }

    if (result.errors.length > 0 && result.data.length === 0) {
      setFileError('Could not read this file. Make sure it is a valid CSV and try again.')
      return
    }

    const headers = (result.meta.fields ?? []).map((h) => h.toLowerCase())

    // Check required headers
    const missing = REQUIRED_HEADERS.filter((r) => !headers.includes(r))
    if (missing.length > 0) {
      setFileError(`Missing required columns: ${missing.join(', ')}`)
      return
    }

    if (result.data.length === 0) {
      setFileError('No data rows found in this file.')
      return
    }

    if (result.data.length > MAX_ROWS) {
      setFileError(`File contains ${result.data.length} rows. Maximum allowed is ${MAX_ROWS}.`)
      return
    }

    // Map header keys case-insensitively
    function get(row: Record<string, string>, key: string): string {
      const found = Object.keys(row).find((k) => k.toLowerCase() === key)
      return found ? (row[found] ?? '').trim() : ''
    }

    function parseNum(val: string): number | null {
      if (!val) return null
      const n = parseFloat(val.replace(/[^0-9.-]/g, ''))
      return isNaN(n) ? null : n
    }

    const rows: Omit<ParsedRow, 'status' | 'errors' | 'warnings'>[] = result.data.map((raw, i) => ({
      index: i + 1,
      raw,
      name: get(raw, 'name'),
      category: get(raw, 'category'),
      description: get(raw, 'description'),
      defaultScope: get(raw, 'defaultscope'),
      unit: get(raw, 'unit'),
      defaultRate: parseNum(get(raw, 'defaultrate')),
      minRate: parseNum(get(raw, 'minrate')),
      maxRate: parseNum(get(raw, 'maxrate')),
      internalNotes: get(raw, 'internalnotes'),
    }))

    // Run server-side duplicate check then build final rows
    runDuplicateCheck(rows)
  }

  async function runDuplicateCheck(
    rows: Omit<ParsedRow, 'status' | 'errors' | 'warnings'>[],
  ) {
    setCheckingDuplicates(true)
    setStep('preview')

    const names = rows.map((r) => r.name).filter(Boolean)
    const { activeNames, archivedNames } = await checkDuplicateServiceNames(names)
    const activeSet = new Set(activeNames)
    const archivedSet = new Set(archivedNames)

    const validated: ParsedRow[] = rows.map((row) => {
      const errors: string[] = []
      const warnings: string[] = []

      if (!row.name || row.name.length < 2) errors.push('Name must be at least 2 characters')
      if (!row.category) errors.push('Category is required')
      if (!row.description) errors.push('Description is required')
      if (!row.unit) errors.push('Unit is required')
      if (row.defaultRate === null || row.defaultRate < 0) {
        errors.push('Default rate must be a valid non-negative number')
      }
      if (row.name && activeSet.has(row.name.toLowerCase())) {
        errors.push(`A service named "${row.name}" already exists in the catalog`)
      }

      if (row.minRate !== null && row.defaultRate !== null && row.minRate > row.defaultRate) {
        warnings.push('Min rate exceeds default rate — double check this')
      }
      if (row.maxRate !== null && row.defaultRate !== null && row.maxRate < row.defaultRate) {
        warnings.push('Max rate is below default rate — double check this')
      }
      if (!row.defaultScope) {
        warnings.push('No default scope — you can add it later')
      }
      if (row.name && archivedSet.has(row.name.toLowerCase())) {
        warnings.push('An archived service with this name exists — importing will create a new active record')
      }

      let status: RowStatus = 'ready'
      if (errors.length > 0) status = 'error'
      else if (warnings.length > 0) status = 'warning'

      return { ...row, status, errors, warnings }
    })

    setParsedRows(validated)
    setCheckingDuplicates(false)
  }

  // ─── Drag & drop ─────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Import ───────────────────────────────────────────────────────────────

  const readyRows = parsedRows.filter((r) => r.status !== 'error')

  function handleImport() {
    const payload: ImportRow[] = readyRows.map((row) => ({
      name: row.name,
      category: row.category,
      description: row.description,
      defaultScope: row.defaultScope || undefined,
      unit: row.unit,
      defaultRate: row.defaultRate!,
      minRate: row.minRate,
      maxRate: row.maxRate,
      internalNotes: row.internalNotes || null,
    }))

    startImporting(async () => {
      try {
        const res = await fetch('/api/catalog/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: payload, filename }),
        })

        if (!res.ok) {
          toast({
            title: 'Import failed',
            description: 'Import failed — please try again. If the problem persists, contact your admin.',
            variant: 'destructive',
          })
          return
        }

        const data: ImportResult = await res.json()
        setImportResult(data)
        setStep('result')
      } catch {
        toast({
          title: 'Import failed',
          description: 'Import failed — please try again. If the problem persists, contact your admin.',
          variant: 'destructive',
        })
        // Keep sheet open with preview visible
      }
    })
  }

  // ─── Error report download ────────────────────────────────────────────────

  function downloadErrorReport(errors: ImportResult['errors']) {
    const headers = 'name,category,description,defaultScope,unit,defaultRate,minRate,maxRate,internalNotes,Error'
    const rows = errors.map((e) => {
      const r = e.row
      const vals = [
        r.name, r.category, r.description,
        r.defaultScope ?? '', r.unit,
        r.defaultRate ?? '', r.minRate ?? '', r.maxRate ?? '',
        r.internalNotes ?? '', e.reason,
      ].map((v) => {
        const s = String(v)
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
      })
      return vals.join(',')
    })
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'import-errors.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Template download helpers ────────────────────────────────────────────

  function downloadTemplate(format: 'csv' | 'xlsx') {
    window.location.href = `/api/catalog/template?format=${format}`
  }

  // ─── Row expand ───────────────────────────────────────────────────────────

  function toggleExpand(idx: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // ─── Computed counts ──────────────────────────────────────────────────────

  const errorCount = parsedRows.filter((r) => r.status === 'error').length
  const readyCount = readyRows.length

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl flex flex-col gap-0 p-0 overflow-hidden"
      >
        <SheetHeader className="px-6 py-5 border-b border-[var(--color-border)] shrink-0">
          <SheetTitle>
            {step === 'upload' && 'Import Services from CSV'}
            {step === 'preview' && 'Preview & Validate'}
            {step === 'result' && 'Import Complete'}
          </SheetTitle>
          <SheetDescription>
            {step === 'upload' && 'Upload a CSV file to bulk-import services into the catalog.'}
            {step === 'preview' && `${parsedRows.length} rows parsed from ${filename}`}
            {step === 'result' && 'Here is a summary of the import.'}
          </SheetDescription>
        </SheetHeader>

        {/* ─── STEP A: UPLOAD ─────────────────────────────────────────── */}
        {step === 'upload' && (
          <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop CSV file here or click to browse"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors cursor-pointer min-h-[200px] px-6 text-center ${
                isDragging
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface)]'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-[var(--color-accent-light)] flex items-center justify-center">
                <Upload size={22} className="text-[var(--color-accent)]" aria-hidden="true" />
              </div>
              <div>
                <p className="font-medium text-[var(--color-primary)]">
                  Drag and drop your CSV here
                </p>
                <p className="text-sm text-[var(--color-muted)] mt-0.5">
                  or{' '}
                  <span className="text-[var(--color-accent)] underline underline-offset-2">
                    browse to choose a file
                  </span>
                </p>
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                .csv files only · max 2MB · max 200 rows
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              aria-label="Choose CSV file"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />

            {/* File error */}
            {fileError && (
              <div className="flex gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                <XCircle size={16} className="shrink-0 mt-0.5" />
                <span>{fileError}</span>
              </div>
            )}

            {/* Template download */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-[var(--color-accent)]" aria-hidden="true" />
                <span className="font-medium text-sm text-[var(--color-primary)]">
                  Download template to get started
                </span>
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                Pre-filled with correct headers and example rows.
              </p>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 min-h-[36px]"
                  onClick={() => downloadTemplate('csv')}
                >
                  <Download size={13} />
                  CSV template
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 min-h-[36px]"
                  onClick={() => downloadTemplate('xlsx')}
                >
                  <Download size={13} />
                  XLSX template
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP B: PREVIEW ────────────────────────────────────────── */}
        {step === 'preview' && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Summary banner */}
            <div
              className={`mx-6 mt-5 mb-3 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
                checkingDuplicates
                  ? 'bg-slate-50 border border-[var(--color-border)] text-[var(--color-muted)]'
                  : errorCount === 0
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-amber-50 border border-amber-200 text-amber-800'
              }`}
            >
              {checkingDuplicates ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-[var(--color-accent)] rounded-full animate-spin shrink-0" />
                  Checking for duplicates…
                </>
              ) : errorCount === 0 ? (
                <>
                  <CheckCircle2 size={16} className="shrink-0" />
                  {readyCount} row{readyCount !== 1 ? 's' : ''} ready to import · 0 rows have errors
                </>
              ) : (
                <>
                  <AlertTriangle size={16} className="shrink-0" />
                  {readyCount} row{readyCount !== 1 ? 's' : ''} ready to import · {errorCount} row{errorCount !== 1 ? 's' : ''} have errors
                </>
              )}
            </div>

            {/* Skeleton while checking */}
            {checkingDuplicates ? (
              <div className="px-6 flex flex-col gap-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              /* Preview table */
              <div className="flex-1 overflow-y-auto px-6">
                <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                        <th className="px-3 py-2 text-left font-medium text-[var(--color-muted)] w-12">#</th>
                        <th className="px-3 py-2 text-left font-medium text-[var(--color-muted)]">Name</th>
                        <th className="px-3 py-2 text-left font-medium text-[var(--color-muted)]">Category</th>
                        <th className="px-3 py-2 text-left font-medium text-[var(--color-muted)]">Unit</th>
                        <th className="px-3 py-2 text-right font-medium text-[var(--color-muted)]">Default Rate</th>
                        <th className="px-3 py-2 text-left font-medium text-[var(--color-muted)] w-24">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row) => {
                        const expanded = expandedRows.has(row.index)
                        return (
                          <>
                            <tr
                              key={`row-${row.index}`}
                              onClick={() => toggleExpand(row.index)}
                              className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)] cursor-pointer transition-colors"
                            >
                              <td className="px-3 py-2 text-[var(--color-muted)] tabular-nums">
                                <span className="flex items-center gap-1">
                                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  {row.index}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-medium text-[var(--color-primary)] max-w-[160px] truncate">
                                {row.name || <span className="text-[var(--color-muted)] italic">empty</span>}
                              </td>
                              <td className="px-3 py-2 text-[var(--color-muted)]">{row.category || '—'}</td>
                              <td className="px-3 py-2 text-[var(--color-muted)]">{row.unit || '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {row.defaultRate !== null
                                  ? '₱' + row.defaultRate.toLocaleString('en-PH', { minimumFractionDigits: 2 })
                                  : '—'}
                              </td>
                              <td className="px-3 py-2">
                                <RowStatusBadge status={row.status} />
                              </td>
                            </tr>
                            {expanded && (
                              <tr key={`row-${row.index}-detail`} className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                                <td colSpan={6} className="px-6 py-3">
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs mb-3">
                                    <DetailField label="Description" value={row.description} />
                                    <DetailField label="Default Scope" value={row.defaultScope} />
                                    <DetailField label="Min Rate" value={row.minRate !== null ? `₱${row.minRate.toLocaleString('en-PH')}` : '—'} />
                                    <DetailField label="Max Rate" value={row.maxRate !== null ? `₱${row.maxRate.toLocaleString('en-PH')}` : '—'} />
                                    <DetailField label="Internal Notes" value={row.internalNotes || '—'} />
                                  </div>
                                  {row.errors.length > 0 && (
                                    <div className="flex flex-col gap-1 mb-2">
                                      {row.errors.map((e, i) => (
                                        <div key={i} className="flex items-start gap-1.5 text-xs text-red-700">
                                          <XCircle size={12} className="shrink-0 mt-0.5" />
                                          {e}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {row.warnings.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                      {row.warnings.map((w, i) => (
                                        <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                                          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                          {w}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-between gap-3 shrink-0">
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              {readyCount === 0 && !checkingDuplicates ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] text-[var(--color-muted)]"
                  onClick={() => { reset() }}
                >
                  Fix errors in your file and re-upload
                </Button>
              ) : (
                <Button
                  type="button"
                  className="min-h-[44px]"
                  disabled={readyCount === 0 || checkingDuplicates || importing}
                  onClick={handleImport}
                >
                  {importing ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Importing…
                    </span>
                  ) : (
                    `Import ${readyCount} ready row${readyCount !== 1 ? 's' : ''}`
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ─── STEP C: RESULT ──────────────────────────────────────────── */}
        {step === 'result' && importResult && (
          <div className="flex-1 overflow-y-auto px-6 py-10 flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-[var(--color-primary)]">
                {importResult.imported} service{importResult.imported !== 1 ? 's' : ''} imported successfully
              </h2>
              {importResult.skipped > 0 && (
                <p className="text-sm text-[var(--color-muted)] mt-1">
                  {importResult.skipped} row{importResult.skipped !== 1 ? 's were' : ' was'} skipped
                </p>
              )}
            </div>

            {importResult.errors.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="gap-2 min-h-[44px]"
                onClick={() => downloadErrorReport(importResult.errors)}
              >
                <Download size={14} />
                Download error report ({importResult.errors.length} skipped row{importResult.errors.length !== 1 ? 's' : ''})
              </Button>
            )}

            <Button
              type="button"
              className="min-h-[44px] px-8"
              onClick={() => handleClose(false)}
            >
              Close
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RowStatusBadge({ status }: { status: RowStatus }) {
  if (status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 size={10} /> Ready
      </span>
    )
  }
  if (status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
        <AlertTriangle size={10} /> Warning
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
      <XCircle size={10} /> Error
    </span>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[var(--color-muted)] font-medium">{label}: </span>
      <span className="text-[var(--color-primary)]">{value || '—'}</span>
    </div>
  )
}
