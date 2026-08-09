-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeploymentStatus" ADD VALUE 'RETRYING';
ALTER TYPE "DeploymentStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "buildCommand" TEXT,
ADD COLUMN     "lastRetriedAt" TIMESTAMP(3),
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "servicePath" TEXT,
ADD COLUMN     "startCommand" TEXT;

-- AlterTable
ALTER TABLE "DeploymentLog" ADD COLUMN     "attemptId" TEXT;

-- CreateTable
CREATE TABLE "DeploymentAttempt" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'PREPARING',
    "errorMessage" TEXT,
    "previewUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeploymentAttempt_deploymentId_attemptNumber_idx" ON "DeploymentAttempt"("deploymentId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentAttempt_deploymentId_attemptNumber_key" ON "DeploymentAttempt"("deploymentId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "DeploymentAttempt" ADD CONSTRAINT "DeploymentAttempt_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentLog" ADD CONSTRAINT "DeploymentLog_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "DeploymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
