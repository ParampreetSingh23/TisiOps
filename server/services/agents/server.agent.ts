import { prisma } from "../../db/prisma"
import type { ServerAgentResult } from "./agent.types"

export async function runServerAgent(deploymentId: string): Promise<ServerAgentResult> {
  const server = await prisma.server.findFirst({
    where: { deploymentId },
    orderBy: { createdAt: "desc" },
  })

  return {
    sshReachable: server ? ["READY", "CONNECTED"].includes(server.status) : null,
    dockerInstalled: server?.dockerStatus ?? null,
    caddyRunning: null,
    diskUsage: server?.diskGb ? `${server.diskGb} GB` : null,
    memoryUsage: server?.memoryMb ? `${server.memoryMb} MB` : null,
  }
}
