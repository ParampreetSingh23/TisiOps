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
  connectedProviders: number
  statusBreakdown: { status: string; count: number }[]
  providerBreakdown: { provider: string; count: number }[]
  deploymentTrend: { date: string; deployments: number; aiActions: number }[]
  recentDeployments: {
    id: string
    appName: string
    status: string
    provider: string
    updatedAt: string
  }[]
}

const EMPTY: OverviewStats = {
  deployments: 0,
  live: 0,
  activeServers: 0,
  stopped: 0,
  failed: 0,
  aiActionsToday: 0,
  connectedProviders: 0,
  statusBreakdown: [],
  providerBreakdown: [],
  deploymentTrend: lastSevenDays().map((date) => ({
    date: date.slice(5),
    deployments: 0,
    aiActions: 0,
  })),
  recentDeployments: [],
}

function lastSevenDays(now = new Date()) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - (6 - index))
    return date.toISOString().slice(0, 10)
  })
}

function labelize(value: string) {
  return value
    .toLowerCase()
    .replace(/^tisiops_managed_/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
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

  const days = lastSevenDays()
  const since = new Date(`${days[0]}T00:00:00.000Z`)

  const [
    deployments,
    live,
    activeServers,
    stopped,
    failed,
    usage,
    connectedProviders,
    statuses,
    providers,
    deploymentDays,
    aiUsageDays,
    recentDeployments,
  ] =
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
      prisma.cloudProviderConnection.count({
        where: { userId, status: "CONNECTED" },
      }),
      prisma.deployment.groupBy({
        by: ["status"],
        where: { userId, status: { not: "CANCELLED" } },
        _count: { _all: true },
      }),
      prisma.deployment.groupBy({
        by: ["provider"],
        where: { userId, status: { not: "CANCELLED" } },
        _count: { _all: true },
      }),
      prisma.deployment.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.aiUsageDaily.groupBy({
        by: ["date"],
        where: { userId, date: { in: days } },
        _sum: { messageCount: true },
      }),
      prisma.deployment.findMany({
        where: { userId, status: { not: "CANCELLED" } },
        orderBy: { updatedAt: "desc" },
        take: 4,
        select: {
          id: true,
          appName: true,
          status: true,
          provider: true,
          updatedAt: true,
        },
      }),
    ])

  const deploymentsByDate = new Map(days.map((date) => [date, 0]))
  for (const deployment of deploymentDays) {
    const date = deployment.createdAt.toISOString().slice(0, 10)
    deploymentsByDate.set(date, (deploymentsByDate.get(date) ?? 0) + 1)
  }

  const aiActionsByDate = new Map(
    aiUsageDays.map((day) => [day.date, day._sum.messageCount ?? 0])
  )

  return {
    deployments,
    live,
    activeServers,
    stopped,
    failed,
    aiActionsToday: usage._sum.messageCount ?? 0,
    connectedProviders,
    statusBreakdown: statuses.map((status) => ({
      status: labelize(status.status),
      count: status._count._all,
    })),
    providerBreakdown: providers.map((provider) => ({
      provider: labelize(provider.provider),
      count: provider._count._all,
    })),
    deploymentTrend: days.map((date) => ({
      date: date.slice(5),
      deployments: deploymentsByDate.get(date) ?? 0,
      aiActions: aiActionsByDate.get(date) ?? 0,
    })),
    recentDeployments: recentDeployments.map((deployment) => ({
      id: deployment.id,
      appName: deployment.appName,
      status: labelize(deployment.status),
      provider: labelize(deployment.provider),
      updatedAt: deployment.updatedAt.toISOString(),
    })),
  }
}
