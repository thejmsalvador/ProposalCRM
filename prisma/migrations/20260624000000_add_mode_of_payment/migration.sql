-- CreateTable
CREATE TABLE "ModeOfPayment" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branch" TEXT,
    "swiftCode" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeOfPayment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "modesOfPayment" JSONB;
