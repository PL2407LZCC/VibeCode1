-- Create soft-delete metadata for purchases
ALTER TABLE "purchases"
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByAdminId" TEXT;

CREATE INDEX "purchases_isDeleted_idx" ON "purchases"("isDeleted");

ALTER TABLE "purchases"
ADD CONSTRAINT "purchases_deletedByAdminId_fkey"
FOREIGN KEY ("deletedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
