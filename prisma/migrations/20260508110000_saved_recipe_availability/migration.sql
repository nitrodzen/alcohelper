ALTER TABLE "SavedRecipe" ADD COLUMN "availabilityStatus" TEXT;
ALTER TABLE "SavedRecipe" ADD COLUMN "availabilityComment" TEXT;
ALTER TABLE "SavedRecipe" ADD COLUMN "availabilityDetails" JSONB;
ALTER TABLE "SavedRecipe" ADD COLUMN "availabilityCheckedAt" TIMESTAMP(3);
ALTER TABLE "SavedRecipe" ADD COLUMN "availabilityInventorySnapshot" JSONB;
ALTER TABLE "SavedRecipe" ADD COLUMN "availabilityModel" TEXT;
