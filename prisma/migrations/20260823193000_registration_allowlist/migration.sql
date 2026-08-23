CREATE TABLE "RegistrationAllowlistEntry" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdByEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationAllowlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistrationAllowlistEntry_email_key"
  ON "RegistrationAllowlistEntry"("email");

CREATE INDEX "RegistrationAllowlistEntry_createdAt_idx"
  ON "RegistrationAllowlistEntry"("createdAt");
