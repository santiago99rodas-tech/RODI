-- Journal book (Club): one page per visited country and the photos pasted on it. Additive only.
CREATE TABLE "JournalPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "countryHandle" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "JournalPage_shop_customerId_countryHandle_key" ON "JournalPage"("shop", "customerId", "countryHandle");
CREATE INDEX "JournalPage_shop_customerId_idx" ON "JournalPage"("shop", "customerId");

CREATE TABLE "JournalPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "JournalPhoto_shop_customerId_idx" ON "JournalPhoto"("shop", "customerId");
