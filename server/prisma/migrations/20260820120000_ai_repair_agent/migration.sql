CREATE TYPE "RepairPlanStatus" AS ENUM (
  'DRAFT',
  'APPROVAL_REQUIRED',
  'APPROVED',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "RepairRiskLevel" AS ENUM (
  'READ_ONLY',
  'PLANNING',
  'EXECUTION',
  'DESTRUCTIVE'
);

ALTER TABLE "AiChatSession"
  ADD COLUMN "activeDeploymentId" TEXT,
  ADD COLUMN "latestRepairPlanId" TEXT,
  ADD COLUMN "latestFailurePoint" TEXT,
  ADD COLUMN "latestRecommendedAction" TEXT;

CREATE TABLE "RepairPlan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "status" "RepairPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "failurePoint" TEXT,
  "lastSuccessfulStep" TEXT,
  "likelyCause" TEXT NOT NULL,
  "recommendedFix" TEXT NOT NULL,
  "riskLevel" "RepairRiskLevel" NOT NULL,
  "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
  "actionsJson" JSONB NOT NULL,
  "evidenceJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RepairPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT,
  "deploymentId" TEXT,
  "agentName" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "inputSummary" TEXT NOT NULL,
  "outputSummary" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RepairPlan_userId_deploymentId_createdAt_idx"
  ON "RepairPlan"("userId", "deploymentId", "createdAt");

CREATE INDEX "AgentRun_userId_createdAt_idx"
  ON "AgentRun"("userId", "createdAt");

CREATE INDEX "AgentRun_deploymentId_createdAt_idx"
  ON "AgentRun"("deploymentId", "createdAt");

ALTER TABLE "RepairPlan"
  ADD CONSTRAINT "RepairPlan_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepairPlan"
  ADD CONSTRAINT "RepairPlan_deploymentId_fkey"
  FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_deploymentId_fkey"
  FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
