-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "products" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(10, 2) NOT NULL,
  "imageUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "inventoryCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT,
  "productId" TEXT NOT NULL,
  "recordedBy" TEXT,
  CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference" TEXT NOT NULL,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
  "totalAmount" DECIMAL(10, 2) NOT NULL,
  "notes" TEXT,
  CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
  "id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(10, 2) NOT NULL,
  "productId" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_isActive_idx" ON "products" ("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_reference_key" ON "purchases" ("reference");

-- CreateIndex
CREATE INDEX "purchase_items_productId_idx" ON "purchase_items" ("productId");

-- AddForeignKey
ALTER TABLE "inventory_adjustments"
  ADD CONSTRAINT "inventory_adjustments_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_items"
  ADD CONSTRAINT "purchase_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_items"
  ADD CONSTRAINT "purchase_items_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "purchases" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
