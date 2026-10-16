-- Which countries members have in their passport (visited / want to go / planned), one row per member and country.
-- Only used for the public popularity ranking on the Home; the passport itself stays in the customer metafield. Additive only.
CREATE TABLE "CountryTravel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "countryHandle" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CountryTravel_shop_customerId_countryHandle_key" ON "CountryTravel"("shop", "customerId", "countryHandle");
CREATE INDEX "CountryTravel_shop_countryHandle_idx" ON "CountryTravel"("shop", "countryHandle");
