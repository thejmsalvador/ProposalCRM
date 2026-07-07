-- Enable Row Level Security on every table in the public schema.
--
-- The app connects to Postgres through Prisma as the table-owning `postgres`
-- role, which bypasses RLS, so application behavior is unchanged. The purpose
-- here is to lock down the auto-generated PostgREST API (reachable with the
-- public NEXT_PUBLIC anon key shipped in the browser bundle): with RLS enabled
-- and NO permissive policies, the `anon` and `authenticated` roles can read or
-- write zero rows. See Supabase advisor lint 0013_rls_disabled_in_public.
--
-- Intentionally no CREATE POLICY statements: all data access must go through
-- the app's Prisma layer, never PostgREST.

ALTER TABLE "Proposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalLineItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TCTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModeOfPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SystemSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
