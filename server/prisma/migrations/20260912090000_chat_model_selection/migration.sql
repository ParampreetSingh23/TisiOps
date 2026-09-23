ALTER TABLE "AiChatSession" ADD COLUMN "selectedModelId" TEXT;
ALTER TABLE "AiChatMessage" ADD COLUMN "provider" TEXT;
ALTER TABLE "AiChatMessage" ADD COLUMN "modelId" TEXT;
