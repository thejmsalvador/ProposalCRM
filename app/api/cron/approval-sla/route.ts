import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
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
    notified++
  }

  return NextResponse.json({ notified })
}
