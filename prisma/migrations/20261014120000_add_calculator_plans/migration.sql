-- AlterTable
ALTER TABLE "Participant" ADD COLUMN "weight" REAL NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "planId" TEXT;

-- CreateTable
CREATE TABLE "CalculatorPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "total" REAL NOT NULL DEFAULT 0,
    "tripId" TEXT,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Expense_planId_idx" ON "Expense"("planId");

-- CreateIndex
CREATE INDEX "CalculatorPlan_shop_customerId_idx" ON "CalculatorPlan"("shop", "customerId");
