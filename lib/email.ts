import { Resend } from 'resend'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const FROM = 'ProposalCRM <proposals@no-reply.sunday.ph>'

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  // Instantiate lazily: the Resend constructor throws when the key is missing,
  // and this module is imported by routes Next evaluates at build time (e.g. the
  // cron routes). Constructing here — only when a key exists and an email is
  // actually sent — keeps the production build independent of RESEND_API_KEY.
  if (!apiKey) return
  const resend = new Resend(apiKey)
  // Best-effort: a failed notification email must never break the caller's core
  // mutation (status transitions, cron runs). The Resend SDK returns { error }
  // for API failures (e.g. an unverified sending domain) instead of throwing, so
  // log it explicitly — otherwise sends fail silently and invisibly.
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html })
    if (error) console.error(`[email] Resend rejected send to ${to}:`, error)
  } catch (err) {
    console.error(`[email] Failed to send to ${to}:`, err)
  }
}

// Escape user-supplied values before interpolating them into email HTML so an
// internal user can't inject markup/links into emails delivered to colleagues.
function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── Button helper ────────────────────────────────────────────────────────────

function viewButton(href: string, label = 'View Proposal') {
  return `<a href="${href}" style="display:inline-block;padding:10px 20px;background:#214ADE;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>`
}

function layout(body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F7FF;font-family:Inter,sans-serif;color:#0D1B4B;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #D0D9F5;overflow:hidden;">
      <tr><td style="background:#214ADE;padding:20px 32px;">
        <span style="color:#fff;font-size:18px;font-weight:700;">ProposalCRM</span>
      </td></tr>
      <tr><td style="padding:32px;">${body}</td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #D0D9F5;background:#F4F7FF;">
        <p style="margin:0;font-size:12px;color:#64748B;">This is an automated message from ProposalCRM. Do not reply to this email.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

// ─── Template: Approval Request ──────────────────────────────────────────────

export function approvalRequestEmail(params: {
  approverName: string
  senderName: string
  proposalNumber: string
  proposalId: string
}) {
  const href = `${APP_URL}/proposals/${params.proposalId}`
  return {
    subject: `Action Required: ${params.proposalNumber} awaits your approval`,
    html: layout(`
      <h2 style="margin:0 0 16px;font-size:20px;">Approval Request</h2>
      <p style="margin:0 0 8px;font-size:15px;">Hi ${esc(params.approverName)},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
        <strong>${esc(params.senderName)}</strong> has submitted proposal
        <strong>${esc(params.proposalNumber)}</strong> for your approval.
        Please review it and take action.
      </p>
      ${viewButton(href)}
    `),
  }
}

// ─── Template: Approved ───────────────────────────────────────────────────────

export function proposalApprovedEmail(params: {
  creatorName: string
  proposalNumber: string
  proposalId: string
}) {
  const href = `${APP_URL}/proposals/${params.proposalId}`
  return {
    subject: `${params.proposalNumber} has been approved`,
    html: layout(`
      <h2 style="margin:0 0 16px;font-size:20px;">Proposal Approved</h2>
      <p style="margin:0 0 8px;font-size:15px;">Hi ${esc(params.creatorName)},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
        Great news! Proposal <strong>${esc(params.proposalNumber)}</strong> has been approved.
        You can now generate and send the PDF to your client.
      </p>
      ${viewButton(href, 'Generate PDF')}
    `),
  }
}

// ─── Template: Revision Requested ────────────────────────────────────────────

export function revisionRequestedEmail(params: {
  creatorName: string
  approverName: string
  proposalNumber: string
  proposalId: string
  comment: string
}) {
  const href = `${APP_URL}/proposals/${params.proposalId}`
  return {
    subject: `Revisions requested on ${params.proposalNumber}`,
    html: layout(`
      <h2 style="margin:0 0 16px;font-size:20px;">Revision Requested</h2>
      <p style="margin:0 0 8px;font-size:15px;">Hi ${esc(params.creatorName)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        <strong>${esc(params.approverName)}</strong> has requested revisions on proposal
        <strong>${esc(params.proposalNumber)}</strong>.
      </p>
      <div style="background:#FFF7ED;border-left:4px solid #D97706;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 24px;">
        <p style="margin:0;font-size:14px;color:#92400E;font-style:italic;">"${esc(params.comment)}"</p>
      </div>
      ${viewButton(href, 'View & Edit Proposal')}
    `),
  }
}

// ─── Template: SLA Reminder ───────────────────────────────────────────────────

export function slaReminderEmail(params: {
  approverName: string
  proposalNumber: string
  proposalId: string
  hoursWaiting: number
}) {
  const href = `${APP_URL}/proposals/${params.proposalId}`
  return {
    subject: `Reminder: ${params.proposalNumber} awaiting approval for ${params.hoursWaiting}h`,
    html: layout(`
      <h2 style="margin:0 0 16px;font-size:20px;">Approval Reminder</h2>
      <p style="margin:0 0 8px;font-size:15px;">Hi ${esc(params.approverName)},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
        This is a reminder that proposal <strong>${esc(params.proposalNumber)}</strong> has been
        awaiting your approval for <strong>${esc(params.hoursWaiting)} hours</strong>.
        Please review it at your earliest convenience.
      </p>
      ${viewButton(href)}
    `),
  }
}
