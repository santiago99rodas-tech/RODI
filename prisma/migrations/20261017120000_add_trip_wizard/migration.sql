-- "Plan a trip" assistant: who is travelling and what they like (JSON, see app/trip-wizard.server.ts). Additive only.
ALTER TABLE "Trip" ADD COLUMN "wizard" TEXT;
