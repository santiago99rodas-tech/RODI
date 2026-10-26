-- Prepaid Club passes bought in the shop (orders/paid webhook): one row per order line, so a repeated delivery never grants twice. Additive only.
CREATE TABLE "ClubPassGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "customerId" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "grantedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ClubPassGrant_shop_orderId_lineItemId_key" ON "ClubPassGrant"("shop", "orderId", "lineItemId");
CREATE INDEX "ClubPassGrant_shop_customerId_idx" ON "ClubPassGrant"("shop", "customerId");
CREATE INDEX "ClubPassGrant_shop_email_status_idx" ON "ClubPassGrant"("shop", "email", "status");
