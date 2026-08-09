-- AlterTable
ALTER TABLE "AiChatSession" ADD COLUMN     "activeBranch" TEXT,
ADD COLUMN     "activeRepoName" TEXT,
ADD COLUMN     "activeRepoOwner" TEXT,
ADD COLUMN     "activeServicePath" TEXT;
