-- Soft-delete flag for ClientContact (replaces hard delete in removeContact).
ALTER TABLE "ClientContact" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
