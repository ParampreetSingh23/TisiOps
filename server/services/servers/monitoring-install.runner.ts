import { prisma } from "../../db/prisma"
import { ensureServerMetricsSchedule } from "../../queues/monitoring.queue"
import {
  AGENT_VERSION,
  installServerMonitoring,
  type MonitoringErrorCode,
} from "./monitoring-installer"
import {
  decryptStoredServerCredentials,
  syncDeploymentSshKeyToServerCredential,
} from "./managed-server-credentials"
import { serverAddress } from "./server.service"

/**
 * Runs one monitoring install end-to-end, from an INSTALLING row to ACTIVE or
 * FAILED. Used by both the monitoring worker (queue path) and the API's
 * in-process fallback when the queue is unavailable — so a Monitor click always
 * proceeds to attempt the install instead of dead-ending on "could not queue".
 *
 * The row is the guard: only an INSTALLING row is a live request, so a stale or
 * replayed invocation is a no-op. Credentials are decrypted only here and never
 * logged. The caller owns logging (via `onLog`) and closes the SSH connection
 * inside the installer.
 */

async function markStatus(
  monitoringId: string,
  status: "ACTIVE" | "FAILED",
  error?: { code: MonitoringErrorCode; message: string }
): Promise<void> {
  await prisma.serverMonitoring.update({
    where: { id: monitoringId },
    data:
      status === "ACTIVE"
        ? {
            status: "ACTIVE",
            agentVersion: AGENT_VERSION,
            installedAt: new Date(),
            lastCheckedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          }
        : {
            status: "FAILED",
            lastCheckedAt: new Date(),
            errorCode: error?.code ?? "UNKNOWN_MONITORING_INSTALL_ERROR",
            errorMessage: error?.message ?? "Monitoring installation failed.",
          },
  })
}

export async function runMonitoringInstall(
  serverId: string,
  monitoringId: string,
  onLog: (message: string) => void = console.log
): Promise<void> {
  const monitoring = await prisma.serverMonitoring.findUnique({
    where: { id: monitoringId },
  })
  if (!monitoring || monitoring.status !== "INSTALLING") return

  const server = await prisma.server.findFirst({
    where: { id: monitoring.serverId, userId: monitoring.userId },
    include: {
      credentials: true,
      deployment: { select: { encryptedSshPrivateKey: true } },
    },
  })
  if (!server) {
    await markStatus(monitoringId, "FAILED", {
      code: "SSH_UNREACHABLE",
      message: "Server no longer exists.",
    })
    return
  }

  if (
    (!server.credentialsStored || !server.credentials) &&
    !server.deployment?.encryptedSshPrivateKey
  ) {
    await markStatus(monitoringId, "FAILED", {
      code: "SSH_AUTH_FAILED",
      message: "No stored SSH credentials for this server.",
    })
    return
  }

  let resolved
  try {
    resolved =
      (await syncDeploymentSshKeyToServerCredential(server)) ??
      decryptStoredServerCredentials(server.credentials)
  } catch {
    await markStatus(monitoringId, "FAILED", {
      code: "SSH_AUTH_FAILED",
      message: "Could not read SSH credentials.",
    })
    return
  }
  if (!resolved?.privateKey && !resolved?.password) {
    await markStatus(monitoringId, "FAILED", {
      code: "SSH_AUTH_FAILED",
      message: "No usable SSH credentials for this server.",
    })
    return
  }

  onLog("Monitoring installation started")
  const result = await installServerMonitoring({
    host: serverAddress(server),
    sshPort: server.sshPort,
    sshUsername: server.sshUsername || "ubuntu",
    authType: resolved.authType,
    privateKey: resolved.privateKey,
    password: resolved.password,
    passphrase: resolved.passphrase,
    serverId: monitoring.serverId,
    installPath: monitoring.installPath || "/opt/tisiops/monitoring",
    onLog,
  })

  if (result.ok) {
    await markStatus(monitoringId, "ACTIVE")
    onLog("Monitoring is active")
    const scheduled = await ensureServerMetricsSchedule(monitoring.serverId)
    if (!scheduled.ok) {
      onLog(`could not schedule metrics collection for ${monitoring.serverId}: ${scheduled.error}`)
    }
    return
  }

  onLog(`Monitoring installation failed: ${result.message}`)
  await markStatus(monitoringId, "FAILED", result)
}
