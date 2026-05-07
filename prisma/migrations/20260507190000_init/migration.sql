CREATE TYPE "InventoryKind" AS ENUM ('ALCOHOL', 'INGREDIENT', 'TOOL');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "InventoryKind" NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "quantity" DECIMAL(10,2),
  "unit" TEXT,
  "abv" DECIMAL(5,2),
  "description" TEXT NOT NULL DEFAULT '',
  "icon" TEXT NOT NULL DEFAULT 'Package',
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedRecipe" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "recipe" JSONB NOT NULL,
  "inventorySnapshot" JSONB NOT NULL,
  "model" TEXT NOT NULL,
  "userNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedRecipe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "InventoryItem_userId_kind_idx" ON "InventoryItem"("userId", "kind");
CREATE INDEX "InventoryItem_userId_name_idx" ON "InventoryItem"("userId", "name");
CREATE INDEX "SavedRecipe_userId_createdAt_idx" ON "SavedRecipe"("userId", "createdAt");

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedRecipe"
  ADD CONSTRAINT "SavedRecipe_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
