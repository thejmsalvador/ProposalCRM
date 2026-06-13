-- AlterEnum
-- New executive roles for the two-stage proposal approval chain (COO reviews, then CEO).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COO';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CEO';
