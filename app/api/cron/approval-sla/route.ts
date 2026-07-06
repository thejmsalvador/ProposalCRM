import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { sendEmail, slaReminderEmail } from '@/lib/email'
import { isAuthorizedCron } from '@/lib/cron-auth'

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const slaHours = parseInt(process.env.APPROVAL_SLA_HOURS ?? '48', 10)
  const cutoff = new Date(Date.now() - slaHours * 60 * 60 * 1000)

  const overdue = await prisma.proposal.findMany({
    where: {
      status: 'PENDING_APPROVAL',
      updatedAt: { lt: cutoff },
      assignedApproverId: { not: null },
    },
    select: {
      id: true,
      number: true,
      updatedAt: true,
      assignedApproverId: true,
      assignedApprover: { select: { email: true, name: true } },
    },
  })

  let notified = 0
  for (const proposal of overdue) {
    const hoursWaiting = Math.floor(
      (Date.now() - proposal.updatedAt.getTime()) / 3600000,
    )
    await createNotification(
      proposal.assignedApproverId!,
      `Reminder: ${proposal.number} has been awaiting your approval for ${hoursWaiting} hours.`,
      `/proposals/${proposal.id}`,
    )
    if (proposal.assignedApprover) {
      const tpl = slaReminderEmail({
        approverName: proposal.assignedApprover.name,
        proposalNumber: proposal.number,
        proposalId: proposal.id,
        hoursWaiting,
      })
      await sendEmail(proposal.assignedApprover.email, tpl.subject, tpl.html)
    }
    notified++
  }

  return NextResponse.json({ notified })
}
