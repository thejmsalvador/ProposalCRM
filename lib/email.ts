import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const FROM = 'ProposalCRM <noreply@proposals.theagency.com>'

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  await resend.emails.send({ from: FROM, to, subject, html })
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
      <p style="margin:0 0 8px;font-size:15px;">Hi ${params.approverName},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
        <strong>${params.senderName}</strong> has submitted proposal
        <strong>${params.proposalNumber}</strong> for your approval.
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
      <p style="margin:0 0 8px;font-size:15px;">Hi ${params.creatorName},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
        Great news! Proposal <strong>${params.proposalNumber}</strong> has been approved.
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
      <p style="margin:0 0 8px;font-size:15px;">Hi ${params.creatorName},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        <strong>${params.approverName}</strong> has requested revisions on proposal
        <strong>${params.proposalNumber}</strong>.
      </p>
      <div style="background:#FFF7ED;border-left:4px solid #D97706;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 24px;">
        <p style="margin:0;font-size:14px;color:#92400E;font-style:italic;">"${params.comment}"</p>
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
      <p style="margin:0 0 8px;font-size:15px;">Hi ${params.approverName},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
        This is a reminder that proposal <strong>${params.proposalNumber}</strong> has been
        awaiting your approval for <strong>${params.hoursWaiting} hours</strong>.
        Please review it at your earliest convenience.
      </p>
      ${viewButton(href)}
    `),
  }
}
