-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'TERRAFORM_DESTROY';

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "costApprovedAt" TIMESTAMP(3),
ADD COLUMN     "destroyApprovedAt" TIMESTAMP(3);
