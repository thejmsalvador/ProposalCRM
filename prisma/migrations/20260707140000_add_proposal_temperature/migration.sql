-- Lead/deal temperature (Hot/Warm/Cold), independent of workflow status. Nullable.
CREATE TYPE "ProposalTemperature" AS ENUM ('HOT', 'WARM', 'COLD');
ALTER TABLE "Proposal" ADD COLUMN "temperature" "ProposalTemperature";
