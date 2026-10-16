-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "ageBand" TEXT,
    "birthYear" INTEGER,
    "birthMonth" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GuardianConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "guardianEmail" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "expiresAt" DATETIME NOT NULL,
    "lastSentAt" DATETIME,
    "approvedAt" DATETIME,
    "approvedIp" TEXT,
    "approvedUserAgent" TEXT,
    "declinedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DataRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "shopifyRequestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "LegalAcceptance_shop_customerId_document_version_idx" ON "LegalAcceptance"("shop", "customerId", "document", "version");

-- CreateIndex
CREATE INDEX "LegalAcceptance_shop_customerId_createdAt_idx" ON "LegalAcceptance"("shop", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianConsent_tokenHash_key" ON "GuardianConsent"("tokenHash");

-- CreateIndex
CREATE INDEX "GuardianConsent_shop_customerId_createdAt_idx" ON "GuardianConsent"("shop", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "DataRequest_shop_createdAt_idx" ON "DataRequest"("shop", "createdAt");

