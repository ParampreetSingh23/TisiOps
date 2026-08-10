ALTER TYPE "DeploymentType" ADD VALUE 'POSTGRES';
ALTER TYPE "JobType" ADD VALUE 'POSTGRES_MANAGED_SERVER_DEPLOYMENT';

CREATE TABLE "PostgresDeploymentConfig" (
  "id" TEXT NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "workspaceName" TEXT NOT NULL,
  "databaseName" TEXT NOT NULL DEFAULT 'appdb',
  "databaseUser" TEXT NOT NULL DEFAULT 'tisiops_user',
  "postgresVersion" TEXT NOT NULL DEFAULT '16-alpine',
  "region" TEXT NOT NULL DEFAULT 'ap-south-1',
  "plan" TEXT NOT NULL DEFAULT 'STARTER',
  "instanceType" TEXT NOT NULL DEFAULT 't3.micro',
  "volumeSizeGb" INTEGER NOT NULL DEFAULT 20,
  "host" TEXT,
  "port" INTEGER NOT NULL DEFAULT 5432,
  "encryptedPassword" TEXT,
  "encryptedDatabaseUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PostgresDeploymentConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PostgresDeploymentConfig_deploymentId_key" ON "PostgresDeploymentConfig"("deploymentId");

ALTER TABLE "PostgresDeploymentConfig"
  ADD CONSTRAINT "PostgresDeploymentConfig_deploymentId_fkey"
  FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
