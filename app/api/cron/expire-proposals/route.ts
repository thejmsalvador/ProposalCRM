import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { isAuthorizedCron } from '@/lib/cron-auth'

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiring = await prisma.proposal.findMany({
    where: {
      validUntil: { lt: today },
      status: { in: ['APPROVED', 'SENT'] },
    },
    select: {
      id: true,
      number: true,
      createdById: true,
    },
  })

  let expired = 0
  for (const proposal of expiring) {
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { status: 'EXPIRED' },
    })

    await prisma.approvalEvent.create({
      data: {
        proposalId: proposal.id,
        action: 'expired',
        actorId: proposal.createdById,
      },
    })

    await createNotification(
      proposal.createdById,
      `Proposal ${proposal.number} has expired and is no longer valid.`,
      `/proposals/${proposal.id}`,
    )

    expired++
  }

  return NextResponse.json({ expired })
}
