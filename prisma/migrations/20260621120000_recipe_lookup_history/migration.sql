ALTER TABLE "RecipeRequestHistory"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'discover',
  ADD COLUMN "result" JSONB;
