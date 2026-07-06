/**
 * Shared read-visibility rule for a single proposal, mirroring the list
 * scoping in buildProposalWhere:
 *   SALES_EXEC     → own proposals only
 *   SALES_MANAGER  → own or same-team
 *   ADMIN/COO/CEO/SUPER_ADMIN → all
 *
 * Kept in a plain (non-'use server') module so it can be imported by both
 * server actions and route handlers as a synchronous helper.
 */
export function canViewProposal(
  user: { id: string; role: string; teamId: string | null },
  proposal: { createdById: string; createdBy: { teamId: string | null } },
): boolean {
  if (user.role === 'SALES_EXEC') return proposal.createdById === user.id
  if (user.role === 'SALES_MANAGER') {
    return proposal.createdById === user.id || proposal.createdBy.teamId === user.teamId
  }
  return true
}

/**
 * Edit/act-on scope for a single proposal. The permission matrix grants
 * edit:any_proposal to SALES_MANAGER, COO, CEO, ADMIN and SUPER_ADMIN, but a
 * SALES_MANAGER's reach must match their team-scoped listings — otherwise they
 * could mutate another team's proposal by guessing its id. Scope is identical
 * to canViewProposal (own → SALES_EXEC; own/team → SALES_MANAGER; all → the
 * org-wide oversight roles), so mutate access lines up with read access.
 */
export function canEditProposal(
  user: { id: string; role: string; teamId: string | null },
  proposal: { createdById: string; createdBy: { teamId: string | null } },
): boolean {
  return canViewProposal(user, proposal)
}
