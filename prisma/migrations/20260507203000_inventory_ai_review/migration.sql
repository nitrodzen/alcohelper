ALTER TABLE "User" ADD COLUMN "inventorySeededAt" TIMESTAMP(3);

ALTER TABLE "InventoryItem" ADD COLUMN "aiReviewedAt" TIMESTAMP(3);
