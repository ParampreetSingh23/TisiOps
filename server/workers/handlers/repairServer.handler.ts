import { prisma } from "../../db/prisma"
import { connectMonitoringSsh } from "../../services/servers/monitoring-ssh"
import { serverAddress } from "../../services/servers/server.service"
import { collectServerMetrics } from "../../services/servers/metrics-collector"
import { decryptSecret } from "../../utils/crypto"

/**
 * Fixed server repair handlers. The worker runs exactly these ids and no other
 * commands — no AI-generated shell, no arbitrary commands in Redis. Actions
 * without a safe implementation resolve to PLANNED_NOT_IMPLEMENTED rather than
 * pretending to run.
 */

export type ServerRepairResult = { ok: boolean; error?: string }

async function markPlan(
  repairPlanId: string,
  status: "COMPLETED" | "FAILED" | "PLANNED_NOT_IMPLEMENTED"
): Promise<void> {
  await prisma.serverRepairPlan.update({
    where: { id: repairPlanId },
    data: { status },
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function restartDocker(
  repairPlanId: string,
  serverId: string
): Promise<ServerRepairResult> {
  const server = await prisma.server.findFirst({
    where: { id: serverId },
    include: { credentials: true },
  })
  if (!server || !server.credentialsStored || !server.credentials) {
    await markPlan(repairPlanId, "FAILED")
    return { ok: false, error: "Server or stored credentials not found." }
  }

  let privateKey: string | undefined
  let password: string | undefined
  let passphrase: string | undefined
  try {
    if (server.credentials.encryptedPrivateKey) privateKey = decryptSecret(server.credentials.encryptedPrivateKey)
    if (server.credentials.encryptedPassword) password = decryptSecret(server.credentials.encryptedPassword)
    if (server.credentials.encryptedPassphrase) passphrase = decryptSecret(server.credentials.encryptedPassphrase)
  } catch {
    await markPlan(repairPlanId, "FAILED")
    return { ok: false, error: "Could not read SSH credentials." }
  }

  const ssh = await connectMonitoringSsh({
    host: serverAddress(server),
    sshPort: server.sshPort,
    sshUsername: server.sshUsername || "ubuntu",
    authType: server.credentials.authType as "key" | "password",
    privateKey,
    password,
    passphrase,
  })
  if (!ssh.ok) {
    await markPlan(repairPlanId, "FAILED")
    return { ok: false, error: ssh.message }
  }

  try {
    const restarted = await ssh.conn.exec("systemctl restart docker\n", ssh.conn.sudo)
    if (!restarted.ok) {
      await markPlan(repairPlanId, "FAILED")
      return { ok: false, error: "Docker restart command failed." }
    }
    await sleep(3000)
    const verify = await ssh.conn.exec(
      "docker info >/dev/null 2>&1 && echo DOCKER_OK || echo DOCKER_DOWN\n",
      ssh.conn.sudo
    )
    if (!/DOCKER_OK/.test(verify.stdout)) {
      await markPlan(repairPlanId, "FAILED")
      return { ok: false, error: "Docker did not become healthy after restart." }
    }
  } finally {
    ssh.conn.close()
  }

  await markPlan(repairPlanId, "COMPLETED")
  return { ok: true }
}

export async function runServerRepair(
  serverId: string,
  repairPlanId: string,
  repairActionId: string
): Promise<ServerRepairResult> {
  switch (repairActionId) {
    case "restart_docker":
      return restartDocker(repairPlanId, serverId)
    case "rerun_healthcheck":
    case "retry_monitoring_collection": {
      // Re-run a real collection; that opens its own secured SSH session.
      const collected = await collectServerMetrics(serverId)
      if (collected.ok) {
        await markPlan(repairPlanId, "COMPLETED")
        return { ok: true }
      }
      await markPlan(repairPlanId, "FAILED")
      return { ok: false, error: "Monitoring collection failed." }
    }
    case "restart_container":
    case "clear_safe_logs":
    case "clear_safe_cache":
    case "upgrade_server":
      await markPlan(repairPlanId, "PLANNED_NOT_IMPLEMENTED")
      return {
        ok: false,
        error: "This repair action is planned but not implemented yet.",
      }
    default:
      await markPlan(repairPlanId, "PLANNED_NOT_IMPLEMENTED")
      return { ok: false, error: "Unknown repair action." }
  }
}
