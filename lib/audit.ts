import { prisma } from './prisma'

/**
 * Writes a record to AuditLog. Call from server actions after mutations.
 */
export async function logAudit(
  entityType: string,
  entityId: string,
  action: string,
  actorId: string,
  diff?: Record<string, unknown>,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      entityType,
      entityId,
      action,
      actorId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      diffJson: (diff ?? undefined) as any,
    },
  })
}
