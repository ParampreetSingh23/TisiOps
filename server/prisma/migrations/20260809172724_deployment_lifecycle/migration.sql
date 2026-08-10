-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeploymentStatus" ADD VALUE 'STOPPING';
ALTER TYPE "DeploymentStatus" ADD VALUE 'STOPPED';
ALTER TYPE "DeploymentStatus" ADD VALUE 'STARTING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'SERVER_STOP';
ALTER TYPE "JobType" ADD VALUE 'SERVER_START';
ALTER TYPE "JobType" ADD VALUE 'VERCEL_DELETE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServerStatus" ADD VALUE 'STOPPING';
ALTER TYPE "ServerStatus" ADD VALUE 'STOPPED';
ALTER TYPE "ServerStatus" ADD VALUE 'STARTING';
