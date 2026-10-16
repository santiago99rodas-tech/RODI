-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "topic" TEXT NOT NULL DEFAULT 'general',
    "tags" TEXT,
    "rating" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'published',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedReplyId" TEXT,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CommunityReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunityReply_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityLike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CommunityPost_shop_status_createdAt_idx" ON "CommunityPost"("shop", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_shop_status_country_idx" ON "CommunityPost"("shop", "status", "country");

-- CreateIndex
CREATE INDEX "CommunityPost_shop_status_topic_idx" ON "CommunityPost"("shop", "status", "topic");

-- CreateIndex
CREATE INDEX "CommunityPost_customerId_idx" ON "CommunityPost"("customerId");

-- CreateIndex
CREATE INDEX "CommunityReply_postId_idx" ON "CommunityReply"("postId");

-- CreateIndex
CREATE INDEX "CommunityReply_customerId_idx" ON "CommunityReply"("customerId");

-- CreateIndex
CREATE INDEX "CommunityLike_targetType_targetId_idx" ON "CommunityLike"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityLike_customerId_targetType_targetId_key" ON "CommunityLike"("customerId", "targetType", "targetId");


-- Copy the existing questions, answers and recommendations into the new forum tables
INSERT INTO "CommunityPost" ("id", "shop", "customerId", "authorName", "type", "title", "body", "topic", "status", "replyCount", "lastActivityAt", "createdAt", "updatedAt")
SELECT q."id", q."shop", q."customerId", q."authorName", 'question', q."title", q."body", 'general', q."status",
       (SELECT COUNT(*) FROM "CommunityAnswer" a WHERE a."questionId" = q."id" AND a."status" = 'published'), q."createdAt", q."createdAt", q."updatedAt"
FROM "CommunityQuestion" q;

INSERT INTO "CommunityReply" ("id", "shop", "customerId", "authorName", "postId", "body", "status", "createdAt", "updatedAt")
SELECT "id", "shop", "customerId", "authorName", "questionId", "body", "status", "createdAt", "updatedAt" FROM "CommunityAnswer";

INSERT INTO "CommunityPost" ("id", "shop", "customerId", "authorName", "type", "title", "body", "city", "topic", "status", "lastActivityAt", "createdAt", "updatedAt")
SELECT "id", "shop", "customerId", "authorName", 'recommendation', "title", "body", "city", 'general', "status", "createdAt", "createdAt", "updatedAt" FROM "CommunityRecommendation";
