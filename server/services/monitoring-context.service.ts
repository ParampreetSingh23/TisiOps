import { prisma } from "../db/prisma"
import { calculateMetricFreshness } from "./servers/metrics-parse"
import { safeSummary } from "./agents/agent-tools"
import { isAiSystemLog } from "./agents/logs.agent"
import type { MonitoringContext } from "./agents/monitoring-health"

/**
 * Gathers the normalized monitoring evidence for one server from Postgres, so
 * the Monitoring Agent never opens SSH. The server must belong to the caller.
 * No secrets and no IP addresses are included — the model only sees safe facts.
 */
export async function getMonitoringContext(
  userId: string,
  serverId: string
): Promise<MonitoringContext | null> {
  const server = await prisma.server.findFirst({
    where: { id: serverId, userId },
    select: { id: true, name: true, deploymentId: true },
  })
  if (!server) return null

  const [monitoring, snapshot] = await Promise.all([
    prisma.serverMonitoring.findFirst({ where: { serverId, userId } }),
    prisma.serverMetricSnapshot.findFirst({ where: { serverId, userId } }),
  ])

  const recentLogs: MonitoringContext["recentLogs"] = []
  if (server.deploymentId) {
    const logs = await prisma.deploymentLog.findMany({
      where: { deploymentId: server.deploymentId },
      orderBy: { createdAt: "desc" },
      take: 8,
    })
    for (const log of logs.reverse()) {
      if (isAiSystemLog(log.message)) continue
      recentLogs.push({
        level: log.level,
        message: safeSummary(log.message),
        createdAt: log.createdAt.toISOString(),
      })
    }
  }

  const lastHeartbeatAt =
    snapshot?.lastHeartbeatAt?.toISOString() ?? monitoring?.lastHeartbeatAt?.toISOString() ?? null

  return {
    serverId: server.id,
    serverName: server.name,
    monitoringStatus: monitoring?.status ?? "NOT_INSTALLED",
    freshness: calculateMetricFreshness(snapshot?.collectedAt ?? null),
    metrics: {
      cpuPercent: snapshot?.cpuPercent ?? null,
      memoryPercent: snapshot?.memoryPercent ?? null,
      diskPercent: snapshot?.diskPercent ?? null,
    },
    docker: {
      status: snapshot?.dockerStatus ?? null,
      containerCount: snapshot?.containerCount ?? 0,
      unhealthyContainers: snapshot?.unhealthyContainers ?? 0,
    },
    lastHeartbeatAt,
    lastCheckedAt: monitoring?.lastCheckedAt?.toISOString() ?? null,
    collectedAt: snapshot?.collectedAt?.toISOString() ?? null,
    healthChecks: [],
    recentLogs,
  }
}
