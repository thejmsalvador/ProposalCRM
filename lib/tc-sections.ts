import { prisma } from './prisma'
import { parseTcSections } from './validations/proposals'

export type ResolvedTcSection = {
  tcTemplateId: string
  name: string
  html: string
}

/**
 * Resolve a proposal's stored `tcSections` JSON into an ordered list of
 * `{ name, html }` ready for display (proposal detail page) and PDF compilation.
 *
 * Each section's `html` is its per-proposal override when present, otherwise the
 * section's current library body. Sections whose template no longer exists are
 * skipped. Archived sections still resolve so existing proposals keep their terms.
 */
export async function resolveTcSections(raw: unknown): Promise<ResolvedTcSection[]> {
  const entries = parseTcSections(raw)
  if (entries.length === 0) return []

  const ids = Array.from(new Set(entries.map((e) => e.tcTemplateId)))
  const templates = await prisma.tCTemplate.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, bodyRichText: true },
  })
  const byId = new Map(templates.map((t) => [t.id, t]))

  return entries.flatMap((e) => {
    const tpl = byId.get(e.tcTemplateId)
    if (!tpl) return []
    return [
      {
        tcTemplateId: e.tcTemplateId,
        name: tpl.name,
        html: e.override != null ? e.override : tpl.bodyRichText,
      },
    ]
  })
}
