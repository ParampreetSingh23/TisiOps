-- CreateTable
CREATE TABLE "AiUsageDaily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageDaily_date_idx" ON "AiUsageDaily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageDaily_userId_date_model_key" ON "AiUsageDaily"("userId", "date", "model");

-- AddForeignKey
ALTER TABLE "AiUsageDaily" ADD CONSTRAINT "AiUsageDaily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
