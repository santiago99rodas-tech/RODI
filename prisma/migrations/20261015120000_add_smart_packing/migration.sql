-- Smart packing: per-trip preferences and the state of derived checklist items. Additive only.
ALTER TABLE "Trip" ADD COLUMN "packPrefs" TEXT;
ALTER TABLE "ChecklistItem" ADD COLUMN "key" TEXT;
ALTER TABLE "ChecklistItem" ADD COLUMN "qty" INTEGER;
CREATE INDEX "ChecklistItem_tripId_key_idx" ON "ChecklistItem"("tripId", "key");
