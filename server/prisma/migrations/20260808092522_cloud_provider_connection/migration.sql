-- CreateEnum
CREATE TYPE "CloudProvider" AS ENUM ('AWS', 'GCP', 'AZURE', 'DIGITALOCEAN', 'HETZNER', 'CUSTOM_VPS');

-- CreateEnum
CREATE TYPE "ProviderConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('ACCESS_KEY', 'IAM_ROLE', 'SERVICE_ACCOUNT', 'OAUTH', 'CUSTOM');

-- CreateTable
CREATE TABLE "CloudProviderConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CloudProvider" NOT NULL,
    "credentialType" "CredentialType" NOT NULL DEFAULT 'ACCESS_KEY',
    "name" TEXT NOT NULL,
    "defaultRegion" TEXT NOT NULL,
    "awsAccountId" TEXT,
    "awsArn" TEXT,
    "awsUserId" TEXT,
    "accessKeyLast4" TEXT,
    "encryptedAccessKeyId" TEXT,
    "encryptedSecretAccessKey" TEXT,
    "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "lastVerifiedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CloudProviderConnection_userId_idx" ON "CloudProviderConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CloudProviderConnection_userId_provider_name_key" ON "CloudProviderConnection"("userId", "provider", "name");

-- AddForeignKey
ALTER TABLE "CloudProviderConnection" ADD CONSTRAINT "CloudProviderConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
