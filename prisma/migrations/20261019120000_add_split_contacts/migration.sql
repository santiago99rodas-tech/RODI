-- Split: optional contact on a participant, and who an expense is split between
ALTER TABLE "Participant" ADD COLUMN "email" TEXT;
ALTER TABLE "Participant" ADD COLUMN "phone" TEXT;
ALTER TABLE "Expense" ADD COLUMN "splitWith" TEXT;
