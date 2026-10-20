-- Refer a friend: invitation codes and the friends who joined through them. Additive only.
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE UNIQUE INDEX "ReferralCode_shop_customerId_key" ON "ReferralCode"("shop", "customerId");

CREATE TABLE "Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "friendMonths" INTEGER NOT NULL DEFAULT 0,
    "referrerMonths" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardedAt" DATETIME
);

CREATE UNIQUE INDEX "Referral_shop_referredId_key" ON "Referral"("shop", "referredId");
CREATE INDEX "Referral_shop_referrerId_idx" ON "Referral"("shop", "referrerId");
