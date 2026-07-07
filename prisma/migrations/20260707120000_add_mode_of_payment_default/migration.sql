-- Optional "default" bank account for the Mode-of-Payment library.
ALTER TABLE "ModeOfPayment" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
