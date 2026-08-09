-- CreateEnum
CREATE TYPE "DeploymentType" AS ENUM ('VERCEL');

-- CreateEnum
CREATE TYPE "DeploymentProvider" AS ENUM ('TISIOPS_MANAGED_VERCEL');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('PREPARING', 'BUILDING', 'LIVE', 'FAILED', 'PLACEHOLDER');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARNING', 'ERROR', 'SUCCESS');

-- CreateEnum
CREATE TYPE "EnvTarget" AS ENUM ('PRODUCTION', 'PREVIEW', 'DEVELOPMENT');

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "DeploymentType" NOT NULL DEFAULT 'VERCEL',
    "provider" "DeploymentProvider" NOT NULL DEFAULT 'TISIOPS_MANAGED_VERCEL',
    "appName" TEXT NOT NULL,
    "repositoryName" TEXT NOT NULL,
    "repositoryOwner" TEXT NOT NULL,
    "repositoryUrl" TEXT,
    "branch" TEXT NOT NULL,
    "framework" TEXT,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'PREPARING',
    "previewUrl" TEXT,
    "vercelProjectId" TEXT,
    "vercelDeploymentId" TEXT,
    "statusDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentLog" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentEnvVar" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "target" "EnvTarget" NOT NULL DEFAULT 'PREVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentEnvVar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deployment_userId_createdAt_idx" ON "Deployment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DeploymentLog_deploymentId_createdAt_idx" ON "DeploymentLog"("deploymentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentEnvVar_deploymentId_key_target_key" ON "DeploymentEnvVar"("deploymentId", "key", "target");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentLog" ADD CONSTRAINT "DeploymentLog_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentEnvVar" ADD CONSTRAINT "DeploymentEnvVar_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
