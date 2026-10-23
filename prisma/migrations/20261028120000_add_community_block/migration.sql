-- Community: a member can block another member (hides their posts and replies from the blocker). Additive only.
CREATE TABLE "CommunityBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "blockedName" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "CommunityBlock_shop_blockerId_blockedId_key" ON "CommunityBlock"("shop", "blockerId", "blockedId");
CREATE INDEX "CommunityBlock_shop_blockerId_idx" ON "CommunityBlock"("shop", "blockerId");
CREATE INDEX "CommunityBlock_shop_blockedId_idx" ON "CommunityBlock"("shop", "blockedId");
