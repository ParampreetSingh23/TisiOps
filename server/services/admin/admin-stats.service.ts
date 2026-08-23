import { prisma } from "../../db/prisma"

export type AdminPlatformStats = {
  totalUsers: number
  totalDeployments: number
  activeServers: number
  failedJobs: number
  liveDeployments: number
  totalJobs: number
  totalTemplates: number
  recentUsers: {
    id: string
    name: string | null
    email: string
    role: string
    createdAt: string
  }[]
  recentDeployments: {
    id: string
    appName: string
    status: string
    provider: string
    userEmail: string
    createdAt: string
  }[]
  recentJobs: {
    id: string
    type: string
    status: string
    appName: string
    errorMessage: string | null
    createdAt: string
  }[]
}

export async function getAdminPlatformStats(): Promise<AdminPlatformStats> {
  const [
    totalUsers,
    totalDeployments,
    activeServers,
    failedJobs,
    liveDeployments,
    totalJobs,
    totalTemplates,
    recentUsers,
    recentDeployments,
    recentJobs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.deployment.count({ where: { status: { not: "CANCELLED" } } }),
    prisma.server.count({ where: { status: { in: ["READY", "CONNECTED"] } } }),
    prisma.deploymentJob.count({ where: { status: "FAILED" } }),
    prisma.deployment.count({ where: { status: "LIVE" } }),
    prisma.deploymentJob.count(),
    prisma.adminTemplate.count(),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    }),
    prisma.deployment.findMany({
      where: { status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        appName: true,
        status: true,
        provider: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    }),
    prisma.deploymentJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        type: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        deployment: { select: { appName: true } },
      },
    }),
  ])

  return {
    totalUsers,
    totalDeployments,
    activeServers,
    failedJobs,
    liveDeployments,
    totalJobs,
    totalTemplates,
    recentUsers: recentUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    })),
    recentDeployments: recentDeployments.map((d) => ({
      id: d.id,
      appName: d.appName,
      status: d.status,
      provider: d.provider,
      userEmail: d.user?.email ?? "Unknown",
      createdAt: d.createdAt.toISOString(),
    })),
    recentJobs: recentJobs.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      appName: j.deployment?.appName ?? "Unknown",
      errorMessage: j.errorMessage,
      createdAt: j.createdAt.toISOString(),
    })),
  }
}
