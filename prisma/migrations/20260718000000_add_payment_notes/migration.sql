-- Reusable payment-specific terms (penalties, invoicing, grace period, etc.)
-- rendered AFTER the payment schedule table on the proposal PDF, distinct from
-- PaymentTemplate.bodyRichText which prints above the schedule. The library body
-- lives on PaymentTemplate.notesRichText and is overridable per proposal via
-- Proposal.paymentNotesOverride. Both nullable = inherit / none.

-- AlterTable
ALTER TABLE "PaymentTemplate" ADD COLUMN "notesRichText" TEXT;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN "paymentNotesOverride" TEXT;
