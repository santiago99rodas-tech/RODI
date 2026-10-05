-- CreateTable
CREATE TABLE "AbandonedCartLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AbandonedCartLog_shop_checkoutId_key" ON "AbandonedCartLog"("shop", "checkoutId");

-- CreateIndex
CREATE INDEX "AbandonedCartLog_shop_email_createdAt_idx" ON "AbandonedCartLog"("shop", "email", "createdAt");
