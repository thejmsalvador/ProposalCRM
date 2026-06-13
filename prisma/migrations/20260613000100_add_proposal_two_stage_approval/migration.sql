-- AlterTable
-- Track each stage of the COO -> CEO approval chain. A proposal is fully approved
-- (status APPROVED, PDF unlocked) only once both timestamps are set.
ALTER TABLE "Proposal" ADD COLUMN     "cooApprovedAt" TIMESTAMP(3),
ADD COLUMN     "cooApprovedById" TEXT,
ADD COLUMN     "ceoApprovedAt" TIMESTAMP(3),
ADD COLUMN     "ceoApprovedById" TEXT;
