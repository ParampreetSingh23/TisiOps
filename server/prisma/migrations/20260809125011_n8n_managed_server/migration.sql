-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('N8N_MANAGED_SERVER_DEPLOYMENT');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('PROVISIONING', 'READY', 'FAILED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "HostingMode" AS ENUM ('TISIOPS_MANAGED');

-- CreateEnum
CREATE TYPE "DomainMode" AS ENUM ('TISIOPS_SUBDOMAIN', 'CUSTOM', 'NONE');

-- AlterEnum
ALTER TYPE "DeploymentProvider" ADD VALUE 'TISIOPS_MANAGED_AWS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeploymentStatus" ADD VALUE 'DRAFT';
ALTER TYPE "DeploymentStatus" ADD VALUE 'PLANNING';
ALTER TYPE "DeploymentStatus" ADD VALUE 'PENDING';
ALTER TYPE "DeploymentStatus" ADD VALUE 'RUNNING';
ALTER TYPE "DeploymentStatus" ADD VALUE 'PROVISIONING_INFRA';
ALTER TYPE "DeploymentStatus" ADD VALUE 'BOOTSTRAPPING_SERVER';
ALTER TYPE "DeploymentStatus" ADD VALUE 'CONFIGURING_N8N';
ALTER TYPE "DeploymentStatus" ADD VALUE 'WAITING_FOR_DNS';
ALTER TYPE "DeploymentStatus" ADD VALUE 'CONFIGURING_SSL';
ALTER TYPE "DeploymentStatus" ADD VALUE 'HEALTH_CHECKING';

-- AlterEnum
ALTER TYPE "DeploymentType" ADD VALUE 'N8N';

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "domain" TEXT,
ADD COLUMN     "publicUrl" TEXT,
ALTER COLUMN "repositoryName" SET DEFAULT '',
ALTER COLUMN "repositoryOwner" SET DEFAULT '',
ALTER COLUMN "branch" SET DEFAULT '';

-- AlterTable
ALTER TABLE "DeploymentLog" ADD COLUMN     "jobId" TEXT;

-- CreateTable
CREATE TABLE "DeploymentJob" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "type" "JobType" NOT NULL DEFAULT 'N8N_MANAGED_SERVER_DEPLOYMENT',
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payloadJson" JSONB NOT NULL,
    "errorMessage" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "provider" "DeploymentProvider" NOT NULL DEFAULT 'TISIOPS_MANAGED_AWS',
    "region" TEXT NOT NULL,
    "instanceType" TEXT NOT NULL,
    "awsInstanceId" TEXT,
    "awsSecurityGroupId" TEXT,
    "elasticIp" TEXT,
    "publicIp" TEXT,
    "sshUsername" TEXT,
    "status" "ServerStatus" NOT NULL DEFAULT 'PROVISIONING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "N8nDeploymentConfig" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "workspaceName" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "region" TEXT NOT NULL DEFAULT 'ap-south-1',
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "instanceType" TEXT NOT NULL DEFAULT 't3.micro',
    "domainMode" "DomainMode" NOT NULL DEFAULT 'NONE',
    "domain" TEXT,
    "webhookUrl" TEXT,
    "databaseType" TEXT NOT NULL DEFAULT 'postgresdb',
    "hostingMode" "HostingMode" NOT NULL DEFAULT 'TISIOPS_MANAGED',
    "encryptedEncryptionKey" TEXT,
    "encryptedDbPassword" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "N8nDeploymentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeploymentJob_status_createdAt_idx" ON "DeploymentJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeploymentJob_deploymentId_idx" ON "DeploymentJob"("deploymentId");

-- CreateIndex
CREATE INDEX "Server_userId_createdAt_idx" ON "Server"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Server_deploymentId_idx" ON "Server"("deploymentId");

-- CreateIndex
CREATE UNIQUE INDEX "N8nDeploymentConfig_deploymentId_key" ON "N8nDeploymentConfig"("deploymentId");

-- AddForeignKey
ALTER TABLE "DeploymentJob" ADD CONSTRAINT "DeploymentJob_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "N8nDeploymentConfig" ADD CONSTRAINT "N8nDeploymentConfig_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentLog" ADD CONSTRAINT "DeploymentLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeploymentJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
