-- CreateEnum
CREATE TYPE "MonitoringStatus" AS ENUM ('NOT_INSTALLED', 'INSTALLING', 'ACTIVE', 'FAILED', 'DISABLED', 'UPGRADING');

-- CreateTable
CREATE TABLE "ServerMonitoring" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "status" "MonitoringStatus" NOT NULL DEFAULT 'NOT_INSTALLED',
    "agentVersion" TEXT,
    "installPath" TEXT DEFAULT '/opt/tisiops/monitoring',
    "installedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerMonitoring_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServerMonitoring_serverId_key" ON "ServerMonitoring"("serverId");

-- CreateIndex
CREATE INDEX "ServerMonitoring_userId_idx" ON "ServerMonitoring"("userId");

-- CreateIndex
CREATE INDEX "ServerMonitoring_userId_serverId_idx" ON "ServerMonitoring"("userId", "serverId");

-- AddForeignKey
ALTER TABLE "ServerMonitoring" ADD CONSTRAINT "ServerMonitoring_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerMonitoring" ADD CONSTRAINT "ServerMonitoring_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
