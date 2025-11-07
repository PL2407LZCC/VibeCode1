-- CreateTable
CREATE TABLE "kiosk_settings" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "inventoryEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "kiosk_settings_pkey" PRIMARY KEY ("id")
);
