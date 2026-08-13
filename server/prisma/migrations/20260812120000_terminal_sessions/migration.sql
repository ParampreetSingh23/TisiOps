CREATE TYPE "TerminalSessionStatus" AS ENUM ('CONNECTING', 'CONNECTED', 'DISCONNECTED', 'FAILED');

CREATE TABLE "TerminalSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "status" "TerminalSessionStatus" NOT NULL DEFAULT 'CONNECTING',
  "sessionTokenHash" TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "lastActivityAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TerminalSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TerminalSession_userId_createdAt_idx" ON "TerminalSession"("userId", "createdAt");
CREATE INDEX "TerminalSession_serverId_createdAt_idx" ON "TerminalSession"("serverId", "createdAt");
CREATE INDEX "TerminalSession_sessionTokenHash_idx" ON "TerminalSession"("sessionTokenHash");

ALTER TABLE "TerminalSession"
  ADD CONSTRAINT "TerminalSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TerminalSession"
  ADD CONSTRAINT "TerminalSession_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
