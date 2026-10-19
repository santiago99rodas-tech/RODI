-- Emergency contacts can be the people travelling with the member on a trip (additive).
ALTER TABLE "EmergencyContact" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'contact';
ALTER TABLE "EmergencyContact" ADD COLUMN "tripId" TEXT;
CREATE INDEX "EmergencyContact_shop_customerId_tripId_idx" ON "EmergencyContact"("shop", "customerId", "tripId");
