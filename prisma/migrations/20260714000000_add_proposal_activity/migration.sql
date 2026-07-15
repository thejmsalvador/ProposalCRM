-- Proposal collaboration feed: user-posted tasks, notes, file attachments, and
-- links on a proposal, interleaved in the UI with system events
-- (ProposalVersion + ApprovalEvent). Single-table union — type-specific
-- columns are nullable and only populated for the matching "type".

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('TASK', 'NOTE', 'FILE', 'LINK');

-- CreateTable
CREATE TABLE "ProposalActivity" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "url" TEXT,
    "storagePath" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalActivity_proposalId_idx" ON "ProposalActivity"("proposalId");
CREATE INDEX "ProposalActivity_assigneeId_idx" ON "ProposalActivity"("assigneeId");
CREATE INDEX "ProposalActivity_createdById_idx" ON "ProposalActivity"("createdById");
CREATE INDEX "ProposalActivity_completedById_idx" ON "ProposalActivity"("completedById");

-- AddForeignKey
ALTER TABLE "ProposalActivity" ADD CONSTRAINT "ProposalActivity_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProposalActivity" ADD CONSTRAINT "ProposalActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProposalActivity" ADD CONSTRAINT "ProposalActivity_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProposalActivity" ADD CONSTRAINT "ProposalActivity_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Repo convention (see 20260706000000_enable_rls): RLS on, no policies — all
-- access goes through Prisma as the table owner; PostgREST anon reads nothing.
ALTER TABLE "ProposalActivity" ENABLE ROW LEVEL SECURITY;
