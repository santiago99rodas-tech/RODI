-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'budget';

-- AlterTable
ALTER TABLE "ChecklistItem" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
