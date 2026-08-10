CREATE TYPE "TemplateStatus" AS ENUM (
  'DRAFT',
  'VALIDATED',
  'TESTED',
  'PUBLISHED',
  'DISABLED',
  'ARCHIVED'
);

CREATE TYPE "TemplateRunnerType" AS ENUM (
  'DOCKER_COMPOSE_SERVER_RUNNER',
  'DATABASE_SERVICE_RUNNER',
  'N8N_MANAGED_SERVER_RUNNER',
  'CUSTOM_HANDLER'
);

CREATE TABLE "AdminTemplate" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "tags" TEXT[],
  "iconUrl" TEXT,
  "coverImageUrl" TEXT,
  "yamlContent" TEXT NOT NULL,
  "parsedManifest" JSONB NOT NULL,
  "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "runnerType" "TemplateRunnerType",
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdminTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminTemplate_templateId_version_key" ON "AdminTemplate"("templateId", "version");
CREATE INDEX "AdminTemplate_status_updatedAt_idx" ON "AdminTemplate"("status", "updatedAt");
CREATE INDEX "AdminTemplate_templateId_version_idx" ON "AdminTemplate"("templateId", "version");
CREATE INDEX "AdminTemplate_createdBy_idx" ON "AdminTemplate"("createdBy");

ALTER TABLE "AdminTemplate"
  ADD CONSTRAINT "AdminTemplate_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
