-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'PHP',
ADD COLUMN     "engagementTerm" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "estimatedExpenses" JSONB,
ADD COLUMN     "exchangeRate" DECIMAL(12,6);
