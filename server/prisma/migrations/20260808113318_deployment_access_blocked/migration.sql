-- AlterEnum
ALTER TYPE "DeploymentStatus" ADD VALUE 'ACCESS_BLOCKED';

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "outputDirectory" TEXT;
