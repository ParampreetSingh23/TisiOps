-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeploymentStatus" ADD VALUE 'QUEUED';
ALTER TYPE "DeploymentStatus" ADD VALUE 'DEPLOYING';

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'QUEUED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'VERCEL_DEPLOYMENT';
ALTER TYPE "JobType" ADD VALUE 'AWS_APP_DEPLOYMENT';
ALTER TYPE "JobType" ADD VALUE 'RETRY_DEPLOYMENT';
ALTER TYPE "JobType" ADD VALUE 'REPAIR_DEPLOYMENT';
