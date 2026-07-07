-- Covering indexes for foreign-key columns flagged by the Supabase performance
-- advisor (0001_unindexed_foreign_keys). Speeds up joins/deletes on these FKs.
-- Names match Prisma's `<Model>_<field>_idx` convention so the schema stays in sync.

CREATE INDEX IF NOT EXISTS "ApprovalEvent_actorId_idx" ON "ApprovalEvent"("actorId");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX IF NOT EXISTS "Proposal_assignedApproverId_idx" ON "Proposal"("assignedApproverId");
CREATE INDEX IF NOT EXISTS "Proposal_paymentTemplateId_idx" ON "Proposal"("paymentTemplateId");
CREATE INDEX IF NOT EXISTS "Proposal_tcTemplateId_idx" ON "Proposal"("tcTemplateId");
CREATE INDEX IF NOT EXISTS "ProposalLineItem_serviceId_idx" ON "ProposalLineItem"("serviceId");
CREATE INDEX IF NOT EXISTS "ProposalVersion_createdById_idx" ON "ProposalVersion"("createdById");
CREATE INDEX IF NOT EXISTS "Service_paymentTplId_idx" ON "Service"("paymentTplId");
CREATE INDEX IF NOT EXISTS "Service_tcTemplateId_idx" ON "Service"("tcTemplateId");
CREATE INDEX IF NOT EXISTS "Team_managerId_idx" ON "Team"("managerId");
CREATE INDEX IF NOT EXISTS "User_teamId_idx" ON "User"("teamId");
