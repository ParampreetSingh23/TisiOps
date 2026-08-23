-- CreateTable
CREATE TABLE "ServerMetricSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "cpuPercent" DOUBLE PRECISION,
    "memoryPercent" DOUBLE PRECISION,
    "diskPercent" DOUBLE PRECISION,
    "dockerStatus" TEXT,
    "containerCount" INTEGER NOT NULL DEFAULT 0,
    "unhealthyContainers" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeatAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServerMetricSnapshot_serverId_key" ON "ServerMetricSnapshot"("serverId");

-- CreateIndex
CREATE INDEX "ServerMetricSnapshot_userId_idx" ON "ServerMetricSnapshot"("userId");

-- CreateIndex
CREATE INDEX "ServerMetricSnapshot_userId_serverId_idx" ON "ServerMetricSnapshot"("userId", "serverId");

-- AddForeignKey
ALTER TABLE "ServerMetricSnapshot" ADD CONSTRAINT "ServerMetricSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerMetricSnapshot" ADD CONSTRAINT "ServerMetricSnapshot_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
