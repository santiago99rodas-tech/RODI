-- "Is it closed?" notices about suggested places (one per member and place). Additive only.
CREATE TABLE "PlaceReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "norm" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "PlaceReport_shop_customerId_city_norm_key" ON "PlaceReport"("shop", "customerId", "city", "norm");
CREATE INDEX "PlaceReport_shop_status_idx" ON "PlaceReport"("shop", "status");
