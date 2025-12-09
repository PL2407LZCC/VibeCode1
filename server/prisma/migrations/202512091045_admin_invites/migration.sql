-- Create AdminInviteStatus enum
CREATE TYPE "AdminInviteStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- Create admin_invites table
CREATE TABLE "admin_invites" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "AdminInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedByAdminId" TEXT,
    CONSTRAINT "admin_invites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_invites_invitedByAdminId_fkey" FOREIGN KEY ("invitedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create indexes and constraints for admin_invites
CREATE UNIQUE INDEX "admin_invites_tokenHash_key" ON "admin_invites"("tokenHash");
CREATE INDEX "admin_invites_email_idx" ON "admin_invites"("email");
CREATE INDEX "admin_invites_status_idx" ON "admin_invites"("status");
