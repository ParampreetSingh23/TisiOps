ALTER TABLE "DeploymentLog"
  ADD COLUMN "step" TEXT,
  ADD COLUMN "stepStatus" TEXT,
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "durationMs" INTEGER,
  ADD COLUMN "traceId" TEXT,
  ADD COLUMN "spanId" TEXT,
  ADD COLUMN "metadataJson" JSONB;

CREATE INDEX "DeploymentLog_deploymentId_step_createdAt_idx"
  ON "DeploymentLog"("deploymentId", "step", "createdAt");
