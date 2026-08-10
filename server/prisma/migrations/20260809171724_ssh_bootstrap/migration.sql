-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "encryptedSshPrivateKey" TEXT,
ADD COLUMN     "sshPublicKey" TEXT;
