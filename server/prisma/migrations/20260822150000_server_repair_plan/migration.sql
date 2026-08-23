-- CreateEnum
CREATE TYPE "ServerRepairStatus" AS ENUM ('DRAFT', 'APPROVAL_REQUIRED', 'APPROVED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PLANNED_NOT_IMPLEMENTED');

-- AlterTable
ALTER TABLE "AiChatSession" ADD COLUMN     "activeServerId" TEXT;

-- CreateTable
CREATE TABLE "ServerRepairPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "actionsJson" JSONB NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" "ServerRepairStatus" NOT NULL DEFAULT 'APPROVAL_REQUIRED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerRepairPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerRepairPlan_userId_serverId_createdAt_idx" ON "ServerRepairPlan"("userId", "serverId", "createdAt");

-- CreateIndex
CREATE INDEX "ServerRepairPlan_status_idx" ON "ServerRepairPlan"("status");

-- AddForeignKey
ALTER TABLE "ServerRepairPlan" ADD CONSTRAINT "ServerRepairPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerRepairPlan" ADD CONSTRAINT "ServerRepairPlan_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
