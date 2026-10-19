-- Activities proposed by the "Plan a trip" assistant: they do not count against the Free plan activity limit (additive).
ALTER TABLE "Activity" ADD COLUMN "suggested" BOOLEAN NOT NULL DEFAULT false;
