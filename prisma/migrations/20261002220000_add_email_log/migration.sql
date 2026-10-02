-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "locale" TEXT,
    "recipient" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_shop_customerId_template_key" ON "EmailLog"("shop", "customerId", "template");
