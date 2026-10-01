-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tripId" TEXT,
    "countryHandle" TEXT,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "photoUrl" TEXT,
    "entryDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JournalEntry_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "JournalEntry_shop_customerId_idx" ON "JournalEntry"("shop", "customerId");

-- CreateIndex
CREATE INDEX "JournalEntry_tripId_idx" ON "JournalEntry"("tripId");
