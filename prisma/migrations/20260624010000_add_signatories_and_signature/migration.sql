-- AlterTable
ALTER TABLE "User" ADD COLUMN     "signatureImageUrl" TEXT;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "signatories" JSONB;
