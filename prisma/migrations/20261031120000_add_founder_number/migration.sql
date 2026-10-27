-- AlterTable
ALTER TABLE "Membership" ADD COLUMN "founderNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Membership_shop_founderNumber_key" ON "Membership"("shop", "founderNumber");
