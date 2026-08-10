import { prisma } from "../../db/prisma"
import { usageDate } from "../ai/limits"

/**
 * The dashboard's headline numbers.
 *
 * Counted from Postgres per request rather than kept as a running total: these
 * are small queries, and a cached counter that drifts from the deployments
 * list is worse than no counter at all.
 *
 * Resolved from the Clerk id so the page can call this directly, and scoped to
 * that user throughout — one account can never see another's totals.
 */

export type OverviewStats = {
  deployments: number
  live: number
  activeServers: number
  stopped: number
  failed: number
  aiActionsToday: number
}

const EMPTY: OverviewStats = {
  deployments: 0,
  live: 0,
  activeServers: 0,
  stopped: 0,
  failed: 0,
  aiActionsToday: 0,
}

export async function getOverviewStats(
  clerkUserId: string | null
): Promise<OverviewStats> {
  if (!clerkUserId) return EMPTY

  const user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
    select: { id: true },
  })

  if (!user) return EMPTY

  const userId = user.id

  const [deployments, live, activeServers, stopped, failed, usage] =
    await Promise.all([
      // Cancelled deployments are history, not inventory.
      prisma.deployment.count({
        where: { userId, status: { not: "CANCELLED" } },
      }),
      prisma.deployment.count({ where: { userId, status: "LIVE" } }),
      // A stopped instance still exists but is not serving, so it is counted
      // separately rather than inflating "active".
      prisma.server.count({
        where: { userId, status: "READY" },
      }),
      prisma.deployment.count({
        where: { userId, status: { in: ["STOPPED", "STOPPING"] } },
      }),
      prisma.deployment.count({ where: { userId, status: "FAILED" } }),
      prisma.aiUsageDaily.aggregate({
        where: { userId, date: usageDate() },
        _sum: { messageCount: true },
      }),
    ])

  return {
    deployments,
    live,
    activeServers,
    stopped,
    failed,
    aiActionsToday: usage._sum.messageCount ?? 0,
  }
}
