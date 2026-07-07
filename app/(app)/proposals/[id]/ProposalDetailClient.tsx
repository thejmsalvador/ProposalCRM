'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Edit2,
  Send,
  FileDown,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ShieldAlert,
  History,
  Eye,
  RotateCcw,
  GitBranch,
  Bookmark,
  Wallet,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sanitizeHtml } from '@/lib/sanitize'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/lib/validations/proposals'
import {
  computeMilestoneAmountsForBasis,
  milestonesPercentTotal,
  remainingTailPercentTotal,
} from '@/lib/payment-schedule'
import type { ProposalDetail, ProposalVersionEntry, VersionSnapshot } from '@/lib/actions/proposals'
import {
  approveProposal,
  requestRevision,
  rejectProposal,
  markAsSent,
  markAsWon,
  markAsLost,
  forceOverrideStatus,
  submitExistingProposal,
  restoreVersion,
  getVersionSnapshot,
} from '@/lib/actions/proposals'
import { saveAsTemplate } from '@/lib/actions/templates'
import { engagementLabel } from '@/lib/validations/catalog'

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  REVISION_REQUIRED: 'Revision Required',
  APPROVED: 'Approved',
  SENT: 'Sent',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On Hold',
  EXPIRED: 'Expired',
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  REVISION_REQUIRED: 'bg-orange-100 text-orange-700',
  APPROVED: 'bg-indigo-100 text-indigo-700',
  SENT: 'bg-purple-100 text-purple-700',
  WON: 'bg-green-100 text-green-700',
  LOST: 'bg-red-100 text-red-700',
  ON_HOLD: 'bg-slate-200 text-slate-600',
  EXPIRED: 'bg-gray-100 text-gray-500',
}

const ALL_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'REVISION_REQUIRED',
  'APPROVED',
  'SENT',
  'WON',
  'LOST',
  'ON_HOLD',
  'EXPIRED',
]

const APPROVAL_EVENT_LABELS: Record<string, string> = {
  submitted: 'Submitted for approval',
  coo_approved: 'Approved by COO',
  approved: 'Approved',
  revision_requested: 'Revision requested',
  rejected: 'Rejected',
  expired: 'Expired',
  won: 'Marked as Won',
  lost: 'Marked as Lost',
  sent: 'Marked as Sent',
  overridden: 'Status force-overridden',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: string) {
  const n = parseFloat(value)
  if (isNaN(n)) return '₱0.00'
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return fmtDate(iso)
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'activity' | 'versions'

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  proposal: ProposalDetail
  currentUser: { id: string; role: string }
  canEdit: boolean
  canApprove: boolean
  canForceOverride: boolean
}

// ─── Snapshot preview component ───────────────────────────────────────────────

function SnapshotPreview({ snapshot }: { snapshot: VersionSnapshot }) {
  // Cast to typed shape for safe rendering
  const sp = snapshot.proposal as {
    clientName?: string
    projectTitle?: string
    date?: string
    validUntil?: string
    subtotal?: string
    discountValue?: string | null
    vatRate?: string | null
    total?: string
    paymentTermsOverride?: string | null
    tcOverride?: string | null
  }
  const lineItems = snapshot.lineItems as {
    description?: string
    quantity?: string
    unitRate?: string
    lineTotal?: string
    isOptional?: boolean
  }[]

  return (
    <div className="flex flex-col gap-5 text-sm">
      {/* Header */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          <span><span className="font-medium text-slate-700">Client:</span> {sp.clientName ?? '—'}</span>
          <span><span className="font-medium text-slate-700">Project:</span> {sp.projectTitle ?? '—'}</span>
          <span><span className="font-medium text-slate-700">Date:</span> {sp.date ? fmtDate(sp.date) : '—'}</span>
          <span><span className="font-medium text-slate-700">Valid until:</span> {sp.validUntil ? fmtDate(sp.validUntil) : '—'}</span>
        </div>
      </div>

      {/* Line items */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Line Items</p>
        {lineItems.length === 0 ? (
          <p className="text-slate-400 italic text-xs">No line items.</p>
        ) : (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-500 uppercase tracking-wide">Term</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-500 uppercase tracking-wide">Item Cost</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-800">
                      {li.description ?? ''}
                      {li.isOptional && (
                        <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">
                          Optional
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">{li.quantity ?? ''}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmt(li.unitRate ?? '0')}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">{fmt(li.lineTotal ?? '0')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pricing summary */}
      <div className="ml-auto w-full max-w-[240px]">
        <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-medium">{fmt(sp.subtotal ?? '0')}</span>
          </div>
          {sp.discountValue && parseFloat(sp.discountValue) > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Discount</span>
              <span className="text-red-600">−{fmt(sp.discountValue)}</span>
            </div>
          )}
          {sp.vatRate && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">VAT ({sp.vatRate}%)</span>
              <span>{fmt(String((parseFloat(sp.subtotal ?? '0') * parseFloat(sp.vatRate)) / 100))}</span>
            </div>
          )}
          <Separator className="my-1" />
          <div className="flex justify-between text-sm font-bold">
            <span>Total</span>
            <span className="text-indigo-700">{fmt(sp.total ?? '0')}</span>
          </div>
        </div>
      </div>

      {/* Payment terms */}
      {sp.paymentTermsOverride && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Payment Terms</p>
          <div
            className="prose prose-sm max-w-none text-slate-700 rounded-lg border border-slate-200 bg-white p-3"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(sp.paymentTermsOverride) }}
          />
        </div>
      )}

      {/* T&C */}
      {sp.tcOverride && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Terms & Conditions</p>
          <div
            className="prose prose-sm max-w-none text-slate-700 rounded-lg border border-slate-200 bg-white p-3 max-h-40 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(sp.tcOverride) }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProposalDetailClient({
  proposal,
  currentUser,
  canEdit,
  canApprove,
  canForceOverride,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Items are costed in ₱; `currency` is the client-facing currency. For non-PHP
  // proposals the converted total = ₱ total ÷ rate (rate is ₱ per 1 unit).
  const cur = proposal.currency
  const fxRate =
    cur !== 'PHP' && proposal.exchangeRate != null && parseFloat(proposal.exchangeRate) > 0
      ? parseFloat(proposal.exchangeRate)
      : null
  const convertedTotal = fxRate != null ? parseFloat(proposal.total) / fxRate : null
  const discountAmt = proposal.discountValue
    ? proposal.discountType === 'percentage'
      ? (parseFloat(proposal.subtotal) * parseFloat(proposal.discountValue)) / 100
      : parseFloat(proposal.discountValue)
    : 0

  // PDF generation
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const latestPdfUrl = proposal.versions.find((v) => v.pdfUrl)?.pdfUrl ?? null
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string | null>(latestPdfUrl)

  // Won/Lost modal
  const [wonLostModal, setWonLostModal] = useState<'won' | 'lost' | null>(null)
  const [lostReason, setLostReason] = useState('')
  const [lostReasonOther, setLostReasonOther] = useState('')
  const [signedDate, setSignedDate] = useState('')

  // Revision dialog
  const [revisionOpen, setRevisionOpen] = useState(false)
  const [revisionComment, setRevisionComment] = useState('')

  // Reject dialog
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // Force override dialog
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideStatus, setOverrideStatus] = useState('')
  const [overrideComment, setOverrideComment] = useState('')

  // Version preview / restore
  const [previewVersion, setPreviewVersion] = useState<ProposalVersionEntry | null>(null)
  const [previewSnapshot, setPreviewSnapshot] = useState<VersionSnapshot | null>(null)
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(new Set())
  const [restoreConfirmId, setRestoreConfirmId] = useState<string | null>(null)

  // Snapshots are large, so they stay server-side until a version is previewed
  useEffect(() => {
    if (!previewVersion) {
      setPreviewSnapshot(null)
      return
    }
    let cancelled = false
    getVersionSnapshot(previewVersion.id).then((snapshot) => {
      if (!cancelled) setPreviewSnapshot(snapshot)
    })
    return () => {
      cancelled = true
    }
  }, [previewVersion])

  // Save as template
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateIsOrgWide, setTemplateIsOrgWide] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  const canManageTemplates =
    currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN'

  const status = proposal.status
  const isAssignedApprover = proposal.assignedApprover?.id === currentUser.id
  // In the two-stage chain, the COO acts first (cooApprovedAt unset), then the CEO.
  const approvalStage: 'COO' | 'CEO' =
    proposal.cooApprovedAt == null ? 'COO' : 'CEO'

  // ─── Action helpers ──────────────────────────────────────────────────────────

  function run(fn: () => Promise<{ success: true } | { error: string }>, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await fn()
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Done' })
        onSuccess?.()
        router.refresh()
      }
    })
  }

  // ─── Approve ────────────────────────────────────────────────────────────────

  function handleApprove() {
    run(() => approveProposal(proposal.id))
  }

  // ─── Request Revision ────────────────────────────────────────────────────────

  function handleRevisionSubmit() {
    if (!revisionComment.trim()) {
      toast({ title: 'Comment required', variant: 'destructive' })
      return
    }
    run(() => requestRevision(proposal.id, revisionComment), () => {
      setRevisionOpen(false)
      setRevisionComment('')
    })
  }

  // ─── Reject ──────────────────────────────────────────────────────────────────

  function handleRejectSubmit() {
    if (!rejectReason.trim()) {
      toast({ title: 'Reason required', variant: 'destructive' })
      return
    }
    run(() => rejectProposal(proposal.id, rejectReason), () => {
      setRejectOpen(false)
      setRejectReason('')
    })
  }

  // ─── Mark as Sent ────────────────────────────────────────────────────────────

  function handleMarkSent() {
    run(() => markAsSent(proposal.id))
  }

  // ─── Won / Lost ──────────────────────────────────────────────────────────────

  function handleWonLostConfirm() {
    if (wonLostModal === 'lost') {
      if (!lostReason) {
        toast({ title: 'Please select a reason', variant: 'destructive' })
        return
      }
      const finalReason = lostReason === 'Other' ? lostReasonOther || 'Other' : lostReason
      run(() => markAsLost(proposal.id, finalReason), () => {
        setWonLostModal(null)
        setLostReason('')
        setLostReasonOther('')
      })
    } else {
      run(() => markAsWon(proposal.id, signedDate || undefined), () => {
        setWonLostModal(null)
        setSignedDate('')
      })
    }
  }

  // ─── Submit for Approval (from detail page) ───────────────────────────────

  function handleSubmitForApproval() {
    run(() => submitExistingProposal(proposal.id))
  }

  // ─── Force Override ──────────────────────────────────────────────────────────

  function handleForceOverride() {
    if (!overrideStatus) {
      toast({ title: 'Select a status', variant: 'destructive' })
      return
    }
    if (!overrideComment.trim()) {
      toast({ title: 'Comment required', variant: 'destructive' })
      return
    }
    run(() => forceOverrideStatus(proposal.id, overrideStatus, overrideComment), () => {
      setOverrideOpen(false)
      setOverrideStatus('')
      setOverrideComment('')
    })
  }

  // ─── Save as template ─────────────────────────────────────────────────────────

  async function handleSaveAsTemplate() {
    if (!templateName.trim()) {
      toast({ title: 'Template name is required', variant: 'destructive' })
      return
    }
    setIsSavingTemplate(true)
    const result = await saveAsTemplate(proposal.id, templateName.trim(), templateIsOrgWide)
    setIsSavingTemplate(false)
    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Template saved', description: `"${templateName}" is now available in the proposal wizard.` })
      setTemplateDialogOpen(false)
      setTemplateName('')
      setTemplateIsOrgWide(false)
    }
  }

  // ─── Restore version ─────────────────────────────────────────────────────────

  function handleRestoreConfirm() {
    if (!restoreConfirmId) return
    run(
      () => restoreVersion(proposal.id, restoreConfirmId),
      () => {
        setRestoreConfirmId(null)
        setPreviewVersion(null)
        router.push(`/proposals/${proposal.id}/edit`)
      },
    )
  }

  function toggleSummary(id: string) {
    setExpandedSummaries((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Generate PDF ────────────────────────────────────────────────────────────

  async function handleGeneratePdf() {
    setIsGeneratingPdf(true)
    try {
      const res = await fetch('/api/pdf/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'PDF generation failed', description: data.error ?? 'Unknown error', variant: 'destructive' })
        return
      }
      setCurrentPdfUrl(data.url)
      toast({ title: 'PDF generated', description: 'Your PDF is ready to download.' })
      window.open(data.url, '_blank')
    } catch {
      toast({ title: 'PDF generation failed', description: 'Network error.', variant: 'destructive' })
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  // ─── Approval action bar (for assigned approver) ─────────────────────────────

  const approvalActionBar =
    canApprove && isAssignedApprover && status === 'PENDING_APPROVAL' ? (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3">
        <p className="text-sm text-amber-800 font-medium">
          {approvalStage === 'COO'
            ? 'This proposal is awaiting your review as COO. Approving routes it to the CEO for final sign-off.'
            : 'This proposal passed COO review and is awaiting your final approval as CEO.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            size="sm"
            className="min-h-[44px] sm:min-h-0 bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
            onClick={handleApprove}
            disabled={isPending}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            {approvalStage === 'COO' ? 'Approve & send to CEO' : 'Give final approval'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] sm:min-h-0 text-orange-600 border-orange-300 hover:bg-orange-50 w-full sm:w-auto"
            onClick={() => setRevisionOpen(true)}
            disabled={isPending}
          >
            Request Revision
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] sm:min-h-0 text-red-600 border-red-200 hover:bg-red-50 w-full sm:w-auto"
            onClick={() => setRejectOpen(true)}
            disabled={isPending}
          >
            <XCircle className="h-4 w-4 mr-1.5" />
            Reject
          </Button>
        </div>
      </div>
    ) : null

  // ─── Main action bar ─────────────────────────────────────────────────────────

  const actionBar = (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit && (
        <Link
          href={`/proposals/${proposal.id}/edit`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <Edit2 className="h-4 w-4 mr-1.5" />
          Edit
        </Link>
      )}

      {(status === 'DRAFT' || status === 'REVISION_REQUIRED') &&
        proposal.createdBy.id === currentUser.id && (
          <Button size="sm" onClick={handleSubmitForApproval} disabled={isPending}>
            <Send className="h-4 w-4 mr-1.5" />
            Submit for Approval
          </Button>
        )}

      {status === 'APPROVED' && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkSent}
            disabled={isPending}
          >
            <Send className="h-4 w-4 mr-1.5" />
            Mark as Sent
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGeneratePdf}
            disabled={isGeneratingPdf}
          >
            {isGeneratingPdf ? (
              <>
                <Clock className="h-4 w-4 mr-1.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-1.5" />
                Generate PDF
              </>
            )}
          </Button>
          {currentPdfUrl && (
            <a
              href={currentPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'bg-indigo-600 hover:bg-indigo-700')}
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              Download PDF
            </a>
          )}
        </>
      )}

      {(status === 'SENT' || status === 'APPROVED') && (
        <>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setWonLostModal('won')}
            disabled={isPending}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Mark as Won
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => setWonLostModal('lost')}
            disabled={isPending}
          >
            <XCircle className="h-4 w-4 mr-1.5" />
            Mark as Lost
          </Button>
        </>
      )}

      {canForceOverride && (
        <Button
          size="sm"
          variant="ghost"
          className="text-slate-500 hover:text-slate-700"
          onClick={() => setOverrideOpen(true)}
        >
          <ShieldAlert className="h-4 w-4 mr-1.5" />
          Force Override
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        className="text-slate-500 hover:text-slate-700"
        onClick={() => {
          setTemplateName(`${proposal.projectTitle} Template`)
          setTemplateDialogOpen(true)
        }}
      >
        <Bookmark className="h-4 w-4 mr-1.5" />
        Save as Template
      </Button>
    </div>
  )

  // ─── Overview tab ────────────────────────────────────────────────────────────

  const overviewTab = (
    <div className="flex flex-col gap-6">
      {/* Line items */}
      <section>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Line Items</h2>
        {proposal.lineItems.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No line items.</p>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Description
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Engagement
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Term
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Item Cost
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Item Total
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Optional
                  </th>
                </tr>
              </thead>
              <tbody>
                {proposal.lineItems.map((li, i) => (
                  <tr
                    key={li.id}
                    className={`border-b border-slate-100 last:border-0 ${
                      i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                    }`}
                  >
                    <td className="px-4 py-3 text-slate-800">
                      <div className="font-medium">{li.description}</div>
                      {li.scopeOfWork && (
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {li.scopeOfWork}
                        </div>
                      )}
                      {li.expenses.length > 0 && (
                        <div className="mt-1.5 rounded-md bg-slate-50 border border-slate-200 px-2 py-1.5">
                          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            <Wallet className="h-3 w-3" />
                            Project Expenses · Internal
                          </div>
                          <ul className="mt-1 space-y-0.5">
                            {li.expenses.map((e, ei) => (
                              <li
                                key={ei}
                                className="flex justify-between gap-3 text-xs text-slate-600 tabular-nums"
                              >
                                <span>{e.label || 'Expense'}</span>
                                <span>{formatCurrency(e.amount)}</span>
                              </li>
                            ))}
                            {li.expenses.length > 1 && (
                              <li className="flex justify-between gap-3 text-xs font-medium text-slate-700 tabular-nums border-t border-slate-200 pt-0.5 mt-0.5">
                                <span>Total</span>
                                <span>
                                  {formatCurrency(
                                    li.expenses.reduce((s, e) => s + e.amount, 0),
                                  )}
                                </span>
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{engagementLabel(li.unit)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{li.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(li.unitRate)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {fmt(li.lineTotal)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {li.isOptional ? (
                        <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                          Optional
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pricing summary */}
      <section>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Pricing Summary</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4 max-w-xs ml-auto">
          <div className="flex justify-between text-sm py-1.5">
            <span className="text-slate-500">Subtotal</span>
            <span className="text-slate-800 font-medium">{fmt(proposal.subtotal)}</span>
          </div>

          {discountAmt > 0 && (
            <div className="flex justify-between text-sm py-1.5">
              <span className="text-slate-500">
                Discount
                {proposal.discountType === 'percentage'
                  ? ` (${proposal.discountValue}%)`
                  : ''}
              </span>
              <span className="text-red-600">−{fmt(String(discountAmt))}</span>
            </div>
          )}

          {proposal.vatRate && (
            <div className="flex justify-between text-sm py-1.5">
              <span className="text-slate-500">VAT ({proposal.vatRate}%)</span>
              <span className="text-slate-700">
                {fmt(
                  String(
                    ((parseFloat(proposal.subtotal) - discountAmt) *
                      parseFloat(proposal.vatRate)) /
                      100,
                  ),
                )}
              </span>
            </div>
          )}

          <Separator className="my-2" />
          <div className="flex justify-between text-base font-bold">
            <span className="text-slate-900">Total (PHP)</span>
            <span className="text-indigo-700">{fmt(proposal.total)}</span>
          </div>

          {cur !== 'PHP' && (
            <div className="flex justify-between items-baseline text-sm font-semibold pt-1.5">
              <span className="text-slate-600">Converted Total ({cur})</span>
              {convertedTotal != null ? (
                <span className="text-right">
                  <span className="text-indigo-700 tabular-nums">
                    {formatCurrency(convertedTotal, cur)}
                  </span>
                  <span className="block text-xs font-normal text-slate-400 tabular-nums">
                    ÷ ₱{fxRate!.toLocaleString('en-PH')} per 1 {cur}
                  </span>
                </span>
              ) : (
                <span className="text-xs font-normal text-amber-600">
                  No exchange rate set
                </span>
              )}
            </div>
          )}
        </div>

        {proposal.pricingNotes && (
          <p className="text-sm text-slate-600 mt-3 italic">{proposal.pricingNotes}</p>
        )}
      </section>

      {/* Payment terms */}
      <section>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Payment Terms</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {proposal.paymentTermsOverride ? (
            <div
              className="prose prose-sm max-w-none text-slate-700"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(proposal.paymentTermsOverride) }}
            />
          ) : proposal.paymentTemplate ? (
            <>
              <p className="text-xs text-slate-400 mb-2">Template: {proposal.paymentTemplate.name}</p>
              <div
                className="prose prose-sm max-w-none text-slate-700"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(proposal.paymentTemplate.bodyRichText) }}
              />
            </>
          ) : (
            <p className="text-sm text-slate-400 italic">No payment terms specified.</p>
          )}

          {proposal.paymentMilestones.length > 0 &&
            (() => {
              const grandTotal = parseFloat(proposal.total) || 0
              const isRemaining = proposal.milestoneBasis === 'remaining'
              const amounts = computeMilestoneAmountsForBasis(
                proposal.paymentMilestones,
                grandTotal,
                proposal.milestoneBasis,
              )
              const percentTotal = milestonesPercentTotal(proposal.paymentMilestones)
              const tailPercentTotal = remainingTailPercentTotal(proposal.paymentMilestones)
              return (
                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                  {isRemaining && (
                    <p className="px-3 pt-2 text-xs text-slate-500">
                      The first milestone is a share of the grand total; the rest split the
                      remaining balance.
                    </p>
                  )}
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left py-2 px-3 font-medium text-slate-500">Milestone</th>
                        <th className="text-left py-2 px-3 font-medium text-slate-500">Due Date</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-500">%</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposal.paymentMilestones.map((m, i) => (
                        <tr key={i} className="border-b border-slate-200 last:border-0">
                          <td className="py-2 px-3 font-medium text-slate-700">
                            {m.label || `Milestone ${i + 1}`}
                          </td>
                          <td className="py-2 px-3 text-slate-500">{m.dueDate || '—'}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                            {m.percent}%
                            {isRemaining && (
                              <span className="ml-1 text-[11px] text-slate-400">
                                {i === 0 ? 'of total' : 'of remaining'}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-medium text-slate-700">
                            {formatCurrency(amounts[i])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                        <td className="py-2 px-3" colSpan={2}>
                          {isRemaining ? 'Total billed' : 'Total'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {isRemaining ? `${tailPercentTotal}%` : `${percentTotal}%`}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {formatCurrency(grandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })()}
        </div>
      </section>

      {/* Mode of Payment */}
      {proposal.modesOfPayment.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-3">Mode of Payment</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {proposal.modesOfPayment.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-slate-200 px-3 py-2.5"
                >
                  <p className="text-sm font-semibold text-slate-800">{m.label}</p>
                  <dl className="mt-1 space-y-0.5 text-xs text-slate-600">
                    <div className="flex gap-1.5">
                      <dt className="text-slate-400">Bank:</dt>
                      <dd className="font-medium">{m.bankName}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-slate-400">Account Name:</dt>
                      <dd>{m.accountName}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-slate-400">Account No.:</dt>
                      <dd className="tabular-nums">{m.accountNumber}</dd>
                    </div>
                    {m.branch && (
                      <div className="flex gap-1.5">
                        <dt className="text-slate-400">Branch:</dt>
                        <dd>{m.branch}</dd>
                      </div>
                    )}
                    {m.swiftCode && (
                      <div className="flex gap-1.5">
                        <dt className="text-slate-400">SWIFT:</dt>
                        <dd className="tabular-nums">{m.swiftCode}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Terms & Conditions */}
      <section>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Terms & Conditions</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {proposal.tcSections.length > 0 ? (
            <div className="space-y-5">
              {proposal.tcSections.map((section, i) => (
                <div key={`${section.tcTemplateId}-${i}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                    {section.name}
                  </p>
                  <div
                    className="prose prose-sm max-w-none text-slate-700"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.html) }}
                  />
                </div>
              ))}
            </div>
          ) : proposal.tcOverride ? (
            <div
              className="prose prose-sm max-w-none text-slate-700"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(proposal.tcOverride) }}
            />
          ) : proposal.tcTemplate ? (
            <>
              <p className="text-xs text-slate-400 mb-2">Template: {proposal.tcTemplate.name}</p>
              <div
                className="prose prose-sm max-w-none text-slate-700"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(proposal.tcTemplate.bodyRichText) }}
              />
            </>
          ) : (
            <p className="text-sm text-slate-400 italic">No T&C specified.</p>
          )}
        </div>
      </section>
    </div>
  )

  // ─── Activity tab ─────────────────────────────────────────────────────────────
  // Merges ProposalVersion records + ApprovalEvents into a single chronological feed

  type ActivityItem =
    | { kind: 'version'; data: ProposalVersionEntry }
    | { kind: 'event'; data: ProposalDetail['approvalEvents'][0] }

  const activityItems: ActivityItem[] = [
    ...proposal.versions.map((v) => ({ kind: 'version' as const, data: v })),
    ...proposal.approvalEvents.map((e) => ({ kind: 'event' as const, data: e })),
  ].sort((a, b) => {
    const dateA = new Date(a.data.createdAt).getTime()
    const dateB = new Date(b.data.createdAt).getTime()
    return dateB - dateA
  })

  const activityTab = (
    <div className="flex flex-col gap-3">
      {activityItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <Clock className="h-8 w-8 text-slate-300" />
          <p className="text-slate-500 text-sm">No activity yet.</p>
        </div>
      ) : (
        <div className="relative pl-5">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-slate-200" />
          {activityItems.map((item) => {
            if (item.kind === 'version') {
              const v = item.data
              return (
                <div key={`v-${v.id}`} className="relative mb-4 last:mb-0">
                  <div className="absolute -left-3 top-1 w-2 h-2 rounded-full bg-slate-400 border-2 border-white" />
                  <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm font-medium text-slate-700">
                          Version {v.versionNumber} saved
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_STYLES[v.status] ?? 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {STATUS_LABELS[v.status] ?? v.status}
                        </span>
                      </div>
                      <span
                        className="text-xs text-slate-400 cursor-default"
                        title={fmtDateTime(v.createdAt)}
                      >
                        {timeAgo(v.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">by {v.createdBy.name}</p>
                    {v.changeSummary && (
                      <p className="text-xs text-slate-500 mt-1 italic">{v.changeSummary}</p>
                    )}
                  </div>
                </div>
              )
            }

            const e = item.data
            return (
              <div key={`e-${e.id}`} className="relative mb-4 last:mb-0">
                <div className="absolute -left-3 top-1 w-2 h-2 rounded-full bg-indigo-400 border-2 border-white" />
                <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800">
                      {APPROVAL_EVENT_LABELS[e.action] ?? e.action}
                    </span>
                    <span
                      className="text-xs text-slate-400 cursor-default"
                      title={fmtDateTime(e.createdAt)}
                    >
                      {timeAgo(e.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">by {e.actor.name}</p>
                  {e.comment && (
                    <p className="mt-2 text-sm text-slate-600 bg-slate-50 rounded p-2 border border-slate-100">
                      {e.comment}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ─── Versions tab ────────────────────────────────────────────────────────────

  const versionsTab = (
    <div className="flex flex-col gap-3">
      {proposal.versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <History className="h-8 w-8 text-slate-300" />
          <p className="text-slate-500 text-sm">No versions saved yet.</p>
          <p className="text-xs text-slate-400">
            A version is saved each time you explicitly save or submit the proposal.
          </p>
        </div>
      ) : (
        <div className="relative pl-5">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-slate-200" />
          {proposal.versions.map((v) => {
            const isExpanded = expandedSummaries.has(v.id)
            const summary = v.changeSummary ?? ''
            const isLong = summary.length > 80

            return (
              <div key={v.id} className="relative mb-4 last:mb-0">
                {/* Timeline dot */}
                <div className="absolute -left-3 top-3 w-2 h-2 rounded-full bg-indigo-500 border-2 border-white" />

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Version badge */}
                      <span className="inline-flex items-center rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-bold text-indigo-700 font-mono">
                        v{v.versionNumber}
                      </span>
                      {/* Status badge */}
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[v.status] ?? 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {STATUS_LABELS[v.status] ?? v.status}
                      </span>
                    </div>
                    {/* Timestamp */}
                    <span
                      className="text-xs text-slate-400 cursor-default shrink-0"
                      title={fmtDateTime(v.createdAt)}
                    >
                      {timeAgo(v.createdAt)}
                      <span className="hidden sm:inline"> · {fmtDate(v.createdAt)}</span>
                    </span>
                  </div>

                  {/* Creator */}
                  <p className="text-xs text-slate-500 mt-1">Saved by {v.createdBy.name}</p>

                  {/* Change summary */}
                  {summary && (
                    <div className="mt-2">
                      <p
                        className={`text-sm text-slate-600 ${
                          !isExpanded && isLong ? 'line-clamp-1' : ''
                        }`}
                      >
                        {summary}
                      </p>
                      {isLong && (
                        <button
                          onClick={() => toggleSummary(v.id)}
                          className="text-xs text-indigo-600 hover:underline mt-0.5"
                        >
                          {isExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setPreviewVersion(v)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Preview
                    </Button>
                    {v.pdfUrl && (
                      <a
                        href={v.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          buttonVariants({ variant: 'outline', size: 'sm' }),
                          'h-7 text-xs px-2.5',
                        )}
                      >
                        <FileDown className="h-3.5 w-3.5 mr-1" />
                        Download PDF
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/proposals"
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Proposals
      </Link>

      {/* Approval action bar */}
      {approvalActionBar}

      {/* Proposal header */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Left: meta */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm text-indigo-700 font-semibold">
                {proposal.number}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600'
                }`}
              >
                {STATUS_LABELS[status] ?? status}
              </span>
              <span className="text-xs text-slate-400">v{proposal.version}</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">{proposal.projectTitle}</h1>
            <p className="text-slate-600">
              {proposal.clientName || (
                <span className="italic text-slate-400">No client name</span>
              )}
              {proposal.department && (
                <span className="text-slate-400"> — {proposal.department}</span>
              )}
              {proposal.contactName && (
                <span className="text-slate-400">
                  {' '}
                  · {proposal.contactName}
                  {proposal.contactTitle && `, ${proposal.contactTitle}`}
                </span>
              )}
            </p>
            {(proposal.contactEmail || proposal.contactPhone) && (
              <p className="text-xs text-slate-400">
                {[proposal.contactEmail, proposal.contactPhone]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {(proposal.businessAddress || proposal.tin || proposal.accountCode) && (
              <p className="text-xs text-slate-400">
                {[
                  proposal.accountCode && `Account: ${proposal.accountCode}`,
                  proposal.businessAddress,
                  proposal.tin && `TIN: ${proposal.tin}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-slate-500 mt-1">
              {proposal.brandName && <span>Brand: {proposal.brandName}</span>}
              <span>Created by {proposal.createdBy.name}</span>
              <span>Proposal date: {fmtDate(proposal.date)}</span>
              <span>Valid until: {fmtDate(proposal.validUntil)}</span>
              {proposal.assignedApprover && (
                <span>Approver: {proposal.assignedApprover.name}</span>
              )}
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex flex-col items-end gap-2">
            {actionBar}
            <p className="text-right text-2xl font-bold text-indigo-700 mt-2">
              {fmt(proposal.total)}
            </p>
            {convertedTotal != null && (
              <p className="text-right text-xs text-slate-400 tabular-nums">
                Client-facing: {formatCurrency(convertedTotal, cur)} (₱
                {fxRate!.toLocaleString('en-PH')}/{cur})
              </p>
            )}
          </div>
        </div>

        {proposal.hasBelowFloorPricing && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            This proposal contains below-floor pricing and requires a Sales Manager approver.
          </div>
        )}

        {proposal.lostReason && status === 'LOST' && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            <XCircle className="h-4 w-4 flex-shrink-0" />
            Lost reason: {proposal.lostReason}
          </div>
        )}

      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-1">
        {(['overview', 'activity', 'versions'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'activity'
              ? 'Activity Feed'
              : tab === 'versions'
              ? `Version History${proposal.versions.length > 0 ? ` (${proposal.versions.length})` : ''}`
              : 'Overview'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && overviewTab}
      {activeTab === 'activity' && activityTab}
      {activeTab === 'versions' && versionsTab}

      {/* ─── Version Preview Modal ─── */}
      <Dialog open={previewVersion !== null} onOpenChange={() => setPreviewVersion(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-slate-400" />
              Version {previewVersion?.versionNumber} Preview
            </DialogTitle>
          </DialogHeader>

          {/* Read-only banner */}
          {previewVersion && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 font-medium">
              You are viewing Version {previewVersion.versionNumber} — {fmtDate(previewVersion.createdAt)} — Read Only
            </div>
          )}

          {previewVersion && (
            previewSnapshot ? (
              <SnapshotPreview snapshot={previewSnapshot} />
            ) : (
              <div className="flex flex-col gap-3 py-2" aria-busy="true">
                <div className="h-16 rounded-lg bg-slate-100 animate-pulse" />
                <div className="h-32 rounded-lg bg-slate-100 animate-pulse" />
                <div className="h-20 w-60 ml-auto rounded-lg bg-slate-100 animate-pulse" />
              </div>
            )
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setPreviewVersion(null)}
            >
              Close
            </Button>
            {canEdit && previewVersion && (
              <Button
                onClick={() => {
                  setRestoreConfirmId(previewVersion.id)
                }}
                disabled={isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Restore this version
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Restore Confirm Dialog ─── */}
      <Dialog open={restoreConfirmId !== null} onOpenChange={() => setRestoreConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Version?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            This will reset the proposal to the state of this version and set the status back to
            <strong> Draft</strong>. A new version record will be created. Historical versions are
            never deleted.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreConfirmId(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRestoreConfirm}
              disabled={isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Yes, Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-indigo-500" />
              Save as Template
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Standard Brand Campaign"
                className="mt-1"
              />
            </div>
            {canManageTemplates && (
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="template-org-wide"
                  checked={templateIsOrgWide}
                  onChange={(e) => setTemplateIsOrgWide(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <Label htmlFor="template-org-wide" className="cursor-pointer">
                  Make available to entire organisation (Org-wide)
                </Label>
              </div>
            )}
            <p className="text-xs text-slate-500">
              The template will pre-fill line items, payment terms, T&C, and pricing settings. Client name, date, and validity period are reset when using a template.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAsTemplate}
              disabled={isSavingTemplate || !templateName.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Bookmark className="h-4 w-4 mr-1.5" />
              {isSavingTemplate ? 'Saving…' : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revision Dialog */}
      <Dialog open={revisionOpen} onOpenChange={setRevisionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Revision</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <Label htmlFor="revision-comment">Comment (required)</Label>
              <Textarea
                id="revision-comment"
                value={revisionComment}
                onChange={(e) => setRevisionComment(e.target.value)}
                placeholder="Describe what needs to be revised…"
                className="mt-1"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRevisionSubmit}
              disabled={isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Request Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Proposal</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <Label htmlFor="reject-reason">Reason (required)</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this proposal is being rejected…"
                className="mt-1"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRejectSubmit}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Reject Proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Won/Lost Modal */}
      <Dialog open={wonLostModal !== null} onOpenChange={() => setWonLostModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {wonLostModal === 'won' ? 'Mark as Won' : 'Mark as Lost'}
            </DialogTitle>
          </DialogHeader>

          {wonLostModal === 'won' && (
            <div className="flex flex-col gap-4 py-2">
              <div>
                <Label htmlFor="signed-date">Signed Date (optional)</Label>
                <Input
                  id="signed-date"
                  type="date"
                  value={signedDate}
                  onChange={(e) => setSignedDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {wonLostModal === 'lost' && (
            <div className="flex flex-col gap-4 py-2">
              <div>
                <Label htmlFor="lost-reason">Reason (required)</Label>
                <Select value={lostReason} onValueChange={setLostReason}>
                  <SelectTrigger id="lost-reason" className="mt-1">
                    <SelectValue placeholder="Select a reason…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Budget">Budget</SelectItem>
                    <SelectItem value="Competitor Selected">Competitor Selected</SelectItem>
                    <SelectItem value="Timeline">Timeline</SelectItem>
                    <SelectItem value="No Response">No Response</SelectItem>
                    <SelectItem value="Scope Mismatch">Scope Mismatch</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {lostReason === 'Other' && (
                <div>
                  <Label htmlFor="lost-reason-other">Details</Label>
                  <Input
                    id="lost-reason-other"
                    value={lostReasonOther}
                    onChange={(e) => setLostReasonOther(e.target.value)}
                    placeholder="Describe the reason…"
                    className="mt-1"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setWonLostModal(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleWonLostConfirm}
              disabled={isPending}
              className={wonLostModal === 'won' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Override Dialog */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-slate-500" />
              Force Status Override
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <Label htmlFor="override-status">New Status (required)</Label>
              <Select value={overrideStatus} onValueChange={setOverrideStatus}>
                <SelectTrigger id="override-status" className="mt-1">
                  <SelectValue placeholder="Select status…" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="override-comment">Comment (required)</Label>
              <Textarea
                id="override-comment"
                value={overrideComment}
                onChange={(e) => setOverrideComment(e.target.value)}
                placeholder="Reason for override…"
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleForceOverride}
              disabled={isPending}
              className="bg-slate-800 hover:bg-slate-900 text-white"
            >
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
