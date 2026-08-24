-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "StagingStatus" AS ENUM ('CREATED', 'ANALYSING', 'PLAN_READY', 'TARGET_SELECTED', 'READY', 'FAILED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "StagingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceServerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "StagingStatus" NOT NULL DEFAULT 'CREATED',
    "target" TEXT,
    "targetLabel" TEXT,
    "planJson" JSONB,
    "runtimeJson" JSONB,
    "discoveredAt" TIMESTAMP(3),
    "discoveryError" TEXT,
    "codeProfileJson" JSONB,
    "blueprintJson" JSONB,
    "stagingJson" JSONB,
    "targetServerId" TEXT,
    "finalPlanJson" JSONB,
    "approvedAt" TIMESTAMP(3),
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StagingSession_userId_createdAt_idx" ON "StagingSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StagingSession_userId_sourceServerId_idx" ON "StagingSession"("userId", "sourceServerId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "StagingSession" ADD CONSTRAINT "StagingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "StagingSession" ADD CONSTRAINT "StagingSession_sourceServerId_fkey" FOREIGN KEY ("sourceServerId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "StagingSession" ADD CONSTRAINT "StagingSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
