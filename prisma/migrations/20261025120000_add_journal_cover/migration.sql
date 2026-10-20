-- Journal covers (Club): the title and ink colour a member picked for each continent album. Additive only.
CREATE TABLE "JournalCover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "continent" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "JournalCover_shop_customerId_continent_key" ON "JournalCover"("shop", "customerId", "continent");
CREATE INDEX "JournalCover_shop_customerId_idx" ON "JournalCover"("shop", "customerId");
