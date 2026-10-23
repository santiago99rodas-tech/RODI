-- Membership: "Fundador" profile flag (launch founders keep a badge and a locked price). Additive only.
ALTER TABLE "Membership" ADD COLUMN "founder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Membership" ADD COLUMN "founderSince" DATETIME;
