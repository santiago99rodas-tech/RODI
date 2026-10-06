-- CreateTable
CREATE TABLE "CountrySave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "countryHandle" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CountrySave_shop_customerId_countryHandle_key" ON "CountrySave"("shop", "customerId", "countryHandle");

-- CreateIndex
CREATE INDEX "CountrySave_shop_countryHandle_idx" ON "CountrySave"("shop", "countryHandle");
