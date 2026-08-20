import { prisma } from "../../db/prisma"
import type { LogsAgentResult } from "./agent.types"
import { safeSummary } from "./agent-tools"

export function isAiSystemLog(message: string): boolean {
  return /^AI repair\b/i.test(message) || /\bRepair (Agent|plan)\b/i.test(message)
}

export async function runLogsAgent(deploymentId: string): Promise<LogsAgentResult> {
  const logs = await prisma.deploymentLog.findMany({
    where: {
      deploymentId,
      NOT: [
        { message: { startsWith: "AI repair" } },
        { message: { contains: "Repair Agent" } },
        { message: { contains: "Repair plan" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  })

  const recentLogs = logs
    .reverse()
    .filter((log) => !isAiSystemLog(log.message))
    .map((log) => ({
      level: log.level,
      message: safeSummary(log.message),
      createdAt: log.createdAt.toISOString(),
    }))
  const errorLogs = recentLogs.filter((log) => log.level === "ERROR")
  const lastLog = recentLogs.at(-1) ?? null

  return {
    recentLogs,
    errorLogs,
    lastLog,
    safeLogSummary:
      errorLogs.at(-1)?.message ??
      lastLog?.message ??
      "No deployment logs recorded yet.",
  }
}
