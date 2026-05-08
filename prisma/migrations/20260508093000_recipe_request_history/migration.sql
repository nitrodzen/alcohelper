ALTER TABLE "SavedRecipe" ADD COLUMN "requestPrompt" TEXT;

CREATE TABLE "RecipeRequestHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL DEFAULT '',
  "inventorySnapshot" JSONB NOT NULL,
  "recipes" JSONB,
  "sources" JSONB NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecipeRequestHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecipeRequestHistory_userId_createdAt_idx" ON "RecipeRequestHistory"("userId", "createdAt");

ALTER TABLE "RecipeRequestHistory"
  ADD CONSTRAINT "RecipeRequestHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
