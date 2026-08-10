-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "planSummary" TEXT,
ADD COLUMN     "template" TEXT,
ADD COLUMN     "terraformOutputs" JSONB;
