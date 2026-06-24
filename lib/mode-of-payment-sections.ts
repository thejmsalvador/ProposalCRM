import { prisma } from './prisma'
import { parseModesOfPayment } from './validations/proposals'

export type ResolvedModeOfPayment = {
  id: string
  label: string
  bankName: string
  accountName: string
  accountNumber: string
  branch: string
  swiftCode: string
}

/**
 * Resolve a proposal's stored `modesOfPayment` JSON into an ordered list of full
 * bank-account details ready for display (proposal detail page) and the PDF.
 *
 * Only the library reference is stored on the proposal; the bank details are
 * looked up here so they always reflect the current library entry. Accounts that
 * no longer exist are skipped. Archived accounts still resolve so existing
 * proposals keep the accounts they were sent with.
 */
export async function resolveModesOfPayment(raw: unknown): Promise<ResolvedModeOfPayment[]> {
  const entries = parseModesOfPayment(raw)
  if (entries.length === 0) return []

  const ids = Array.from(new Set(entries.map((e) => e.modeOfPaymentId)))
  const modes = await prisma.modeOfPayment.findMany({
    where: { id: { in: ids } },
  })
  const byId = new Map(modes.map((m) => [m.id, m]))

  return entries.flatMap((e) => {
    const m = byId.get(e.modeOfPaymentId)
    if (!m) return []
    return [
      {
        id: m.id,
        label: m.label,
        bankName: m.bankName,
        accountName: m.accountName,
        accountNumber: m.accountNumber,
        branch: m.branch ?? '',
        swiftCode: m.swiftCode ?? '',
      },
    ]
  })
}
