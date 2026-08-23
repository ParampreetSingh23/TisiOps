CREATE TABLE "AiProvider" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "baseUrl" TEXT,
  "apiKeyEnvName" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiModel" (
  "id" TEXT NOT NULL,
  "modelCode" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "providerModel" TEXT NOT NULL,
  "description" TEXT,
  "contextWindow" INTEGER,
  "inputPricePer1M" DECIMAL(65,30),
  "outputPricePer1M" DECIMAL(65,30),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "supportsStreaming" BOOLEAN NOT NULL DEFAULT false,
  "supportsJson" BOOLEAN NOT NULL DEFAULT false,
  "supportsTools" BOOLEAN NOT NULL DEFAULT false,
  "tags" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserApiKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserApiKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiUsage" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "apiKeyId" TEXT,
  "source" TEXT NOT NULL,
  "agentName" TEXT,
  "modelCode" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "providerModel" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCost" DECIMAL(65,30),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  "requestId" TEXT,
  "deploymentId" TEXT,
  "sessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiGatewayRequestLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "apiKeyId" TEXT,
  "requestId" TEXT NOT NULL,
  "modelCode" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  "latencyMs" INTEGER,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiGatewayRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiProvider_providerId_key" ON "AiProvider"("providerId");
CREATE INDEX "AiProvider_isEnabled_idx" ON "AiProvider"("isEnabled");
CREATE UNIQUE INDEX "AiModel_modelCode_key" ON "AiModel"("modelCode");
CREATE INDEX "AiModel_providerId_idx" ON "AiModel"("providerId");
CREATE INDEX "AiModel_isEnabled_isPublic_idx" ON "AiModel"("isEnabled", "isPublic");
CREATE UNIQUE INDEX "UserApiKey_keyHash_key" ON "UserApiKey"("keyHash");
CREATE INDEX "UserApiKey_userId_createdAt_idx" ON "UserApiKey"("userId", "createdAt");
CREATE INDEX "UserApiKey_status_idx" ON "UserApiKey"("status");
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");
CREATE INDEX "AiUsage_apiKeyId_createdAt_idx" ON "AiUsage"("apiKeyId", "createdAt");
CREATE INDEX "AiUsage_modelCode_createdAt_idx" ON "AiUsage"("modelCode", "createdAt");
CREATE INDEX "AiUsage_providerId_createdAt_idx" ON "AiUsage"("providerId", "createdAt");
CREATE INDEX "AiUsage_status_createdAt_idx" ON "AiUsage"("status", "createdAt");
CREATE UNIQUE INDEX "AiGatewayRequestLog_requestId_key" ON "AiGatewayRequestLog"("requestId");
CREATE INDEX "AiGatewayRequestLog_userId_createdAt_idx" ON "AiGatewayRequestLog"("userId", "createdAt");
CREATE INDEX "AiGatewayRequestLog_status_createdAt_idx" ON "AiGatewayRequestLog"("status", "createdAt");

ALTER TABLE "AiModel" ADD CONSTRAINT "AiModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProvider"("providerId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserApiKey" ADD CONSTRAINT "UserApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "UserApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiGatewayRequestLog" ADD CONSTRAINT "AiGatewayRequestLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiGatewayRequestLog" ADD CONSTRAINT "AiGatewayRequestLog_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "UserApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
