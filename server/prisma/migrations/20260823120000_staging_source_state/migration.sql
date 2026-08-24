-- AlterEnum
ALTER TYPE "StagingStatus" ADD VALUE IF NOT EXISTS 'SELECT_SOURCE_TYPE';
ALTER TYPE "StagingStatus" ADD VALUE IF NOT EXISTS 'SELECT_SOURCE';
ALTER TYPE "StagingStatus" ADD VALUE IF NOT EXISTS 'SOURCE_DISCOVERY_FAILED';
ALTER TYPE "StagingStatus" ADD VALUE IF NOT EXISTS 'SOURCE_READY';
ALTER TYPE "StagingStatus" ADD VALUE IF NOT EXISTS 'PLAN_NOT_READY';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "StagingSourceType" AS ENUM ('STAGING_SOURCE_SERVER', 'STAGING_SOURCE_REPOSITORY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "StagingSession" ADD COLUMN IF NOT EXISTS "sourceType" "StagingSourceType";
ALTER TABLE "StagingSession" ADD COLUMN IF NOT EXISTS "sourceRepositoryId" TEXT;
ALTER TABLE "StagingSession" ADD COLUMN IF NOT EXISTS "sourceBranch" TEXT;
ALTER TABLE "StagingSession" ALTER COLUMN "sourceServerId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StagingSession_userId_sourceRepositoryId_idx" ON "StagingSession"("userId", "sourceRepositoryId");
