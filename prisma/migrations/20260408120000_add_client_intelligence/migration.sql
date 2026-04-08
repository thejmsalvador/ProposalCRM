-- ─── 1. Create Client table ──────────────────────────────────────────────────

CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- ─── 2. Seed Client rows from distinct ClientContact.companyName ─────────────

INSERT INTO "Client" ("id", "companyName", "createdById", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "companyName",
    MIN("createdById"),
    MIN("createdAt"),
    NOW()
FROM "ClientContact"
WHERE "isDeleted" = false
GROUP BY "companyName";

-- ─── 3. Add new columns to ClientContact ─────────────────────────────────────

ALTER TABLE "ClientContact" ADD COLUMN "clientId" TEXT;
ALTER TABLE "ClientContact" ADD COLUMN "phone" TEXT;
ALTER TABLE "ClientContact" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClientContact" ADD COLUMN "contactNotes" TEXT;

-- ─── 4. Link existing contacts to their new Client records ───────────────────

UPDATE "ClientContact" cc
SET "clientId" = c."id"
FROM "Client" c
WHERE c."companyName" = cc."companyName"
  AND cc."isDeleted" = false;

-- ─── 5. Set isPrimary = true for first contact per client ────────────────────

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY "clientId" ORDER BY "createdAt") AS rn
    FROM "ClientContact"
    WHERE "clientId" IS NOT NULL
)
UPDATE "ClientContact" cc
SET "isPrimary" = true
FROM ranked r
WHERE cc."id" = r."id" AND r."rn" = 1;

-- ─── 6. Remove orphaned / deleted contacts, make clientId NOT NULL ───────────

DELETE FROM "ClientContact" WHERE "isDeleted" = true OR "clientId" IS NULL;

ALTER TABLE "ClientContact" ALTER COLUMN "clientId" SET NOT NULL;

-- ─── 7. Add FK on ClientContact → Client ────────────────────────────────────

ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 8. Drop obsolete columns from ClientContact ─────────────────────────────

ALTER TABLE "ClientContact" DROP COLUMN "companyName";
ALTER TABLE "ClientContact" DROP COLUMN "isDeleted";

-- Rename contactNotes → notes
ALTER TABLE "ClientContact" RENAME COLUMN "contactNotes" TO "notes";

-- ─── 9. Add clientId to Proposal ─────────────────────────────────────────────

ALTER TABLE "Proposal" ADD COLUMN "clientId" TEXT;

-- ─── 10. Populate Proposal.clientId by matching clientName ──────────────────

UPDATE "Proposal" p
SET "clientId" = c."id"
FROM "Client" c
WHERE c."companyName" = p."clientName";

-- ─── 11. Add FK on Proposal → Client ────────────────────────────────────────

ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
