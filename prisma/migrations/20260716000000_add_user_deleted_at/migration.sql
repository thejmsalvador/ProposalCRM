-- Soft-delete marker for User. When a departing employee is deleted, the row is
-- kept (preserving their proposal/approval/audit history) but hidden from the
-- Users list and blocked from signing in. Null = active record.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
