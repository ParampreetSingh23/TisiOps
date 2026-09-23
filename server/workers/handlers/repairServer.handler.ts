import { prisma } from "../../db/prisma"
import { connectMonitoringSsh } from "../../services/servers/monitoring-ssh"
import { serverAddress } from "../../services/servers/server.service"
import { collectServerMetrics } from "../../services/servers/metrics-collector"
import { decryptSecret } from "../../utils/crypto"
import { DOCKER_INSTALL_SCRIPT } from "../../services/servers/monitoring-installer"

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

async function installDocker(repairPlanId: string, serverId: string): Promise<ServerRepairResult> {
  const server = await prisma.server.findFirst({ where: { id: serverId }, include: { credentials: true } })
  if (!server || !server.credentialsStored || !server.credentials) {
    await markPlan(repairPlanId, "FAILED")
    return { ok: false, error: "Server or stored credentials not found." }
  }
  if (!/ubuntu|debian/i.test(`${server.osType ?? ""} ${server.osVersion ?? ""}`)) {
    await markPlan(repairPlanId, "FAILED")
    return { ok: false, error: "Docker installation is supported only on Ubuntu or Debian servers." }
  }
  try {
    const ssh = await connectMonitoringSsh({
      host: serverAddress(server), sshPort: server.sshPort, sshUsername: server.sshUsername || "ubuntu",
      authType: server.credentials.authType as "key" | "password",
      privateKey: server.credentials.encryptedPrivateKey ? decryptSecret(server.credentials.encryptedPrivateKey) : undefined,
      password: server.credentials.encryptedPassword ? decryptSecret(server.credentials.encryptedPassword) : undefined,
      passphrase: server.credentials.encryptedPassphrase ? decryptSecret(server.credentials.encryptedPassphrase) : undefined,
      serverId,
    })
    if (!ssh.ok) {
      await markPlan(repairPlanId, "FAILED")
      return { ok: false, error: ssh.message }
    }
    try {
      const installed = await ssh.conn.exec(DOCKER_INSTALL_SCRIPT, ssh.conn.sudo)
      const verified = await ssh.conn.exec("docker version --format '{{.Server.Version}}' >/dev/null 2>&1 && docker compose version >/dev/null 2>&1\n", ssh.conn.sudo)
      if (!installed.ok || !verified.ok) {
        await markPlan(repairPlanId, "FAILED")
        return { ok: false, error: "Docker could not be installed and verified." }
      }
    } finally { ssh.conn.close() }
  } catch {
    await markPlan(repairPlanId, "FAILED")
    return { ok: false, error: "Docker installation failed." }
  }
  await prisma.server.update({ where: { id: serverId }, data: { dockerStatus: "INSTALLED", lastCheckedAt: new Date() } })
  await markPlan(repairPlanId, "COMPLETED")
  return { ok: true }
}

async function installApache(repairPlanId: string, serverId: string): Promise<ServerRepairResult> {
  const server = await prisma.server.findFirst({ where: { id: serverId }, include: { credentials: true } })
  if (!server || !server.credentialsStored || !server.credentials) {
    await markPlan(repairPlanId, "FAILED")
    return { ok: false, error: "Server or stored credentials not found." }
  }
  if (!/ubuntu|debian/i.test(`${server.osType ?? ""} ${server.osVersion ?? ""}`)) {
    await markPlan(repairPlanId, "FAILED")
    return { ok: false, error: "Apache installation is supported only on Ubuntu or Debian servers." }
  }
  try {
    const ssh = await connectMonitoringSsh({
      host: serverAddress(server), sshPort: server.sshPort, sshUsername: server.sshUsername || "ubuntu",
      authType: server.credentials.authType as "key" | "password",
      privateKey: server.credentials.encryptedPrivateKey ? decryptSecret(server.credentials.encryptedPrivateKey) : undefined,
      password: server.credentials.encryptedPassword ? decryptSecret(server.credentials.encryptedPassword) : undefined,
      passphrase: server.credentials.encryptedPassphrase ? decryptSecret(server.credentials.encryptedPassphrase) : undefined,
      serverId,
    })
    if (!ssh.ok) { await markPlan(repairPlanId, "FAILED"); return { ok: false, error: ssh.message } }
    try {
      const installed = await ssh.conn.exec("export DEBIAN_FRONTEND=noninteractive\napt-get update\napt-get install -y apache2\nsystemctl enable --now apache2\n", ssh.conn.sudo)
      const verified = await ssh.conn.exec("systemctl is-active --quiet apache2 && curl -fsS --max-time 10 http://127.0.0.1/ >/dev/null\n", ssh.conn.sudo)
      if (!installed.ok || !verified.ok) { await markPlan(repairPlanId, "FAILED"); return { ok: false, error: "Apache could not be installed and verified." } }
    } finally { ssh.conn.close() }
  } catch { await markPlan(repairPlanId, "FAILED"); return { ok: false, error: "Apache installation failed." } }
  await markPlan(repairPlanId, "COMPLETED")
  return { ok: true }
}

async function installGit(repairPlanId: string, serverId: string): Promise<ServerRepairResult> {
  const server = await prisma.server.findFirst({ where: { id: serverId }, include: { credentials: true } })
  if (!server || !server.credentialsStored || !server.credentials) {
    await markPlan(repairPlanId, "FAILED")
    return { ok: false, error: "Server or stored credentials not found." }
  }
  if (!/ubuntu|debian/i.test(`${server.osType ?? ""} ${server.osVersion ?? ""}`)) {
    await markPlan(repairPlanId, "FAILED")
    return { ok: false, error: "Git installation is supported only on Ubuntu or Debian servers." }
  }
  try {
    const ssh = await connectMonitoringSsh({
      host: serverAddress(server), sshPort: server.sshPort, sshUsername: server.sshUsername || "ubuntu",
      authType: server.credentials.authType as "key" | "password",
      privateKey: server.credentials.encryptedPrivateKey ? decryptSecret(server.credentials.encryptedPrivateKey) : undefined,
      password: server.credentials.encryptedPassword ? decryptSecret(server.credentials.encryptedPassword) : undefined,
      passphrase: server.credentials.encryptedPassphrase ? decryptSecret(server.credentials.encryptedPassphrase) : undefined,
      serverId,
    })
    if (!ssh.ok) { await markPlan(repairPlanId, "FAILED"); return { ok: false, error: ssh.message } }
    try {
      const installed = await ssh.conn.exec("export DEBIAN_FRONTEND=noninteractive\napt-get update\napt-get install -y git\n", ssh.conn.sudo)
      const verified = await ssh.conn.exec("git --version >/dev/null 2>&1\n", ssh.conn.sudo)
      if (!installed.ok || !verified.ok) { await markPlan(repairPlanId, "FAILED"); return { ok: false, error: "Git could not be installed and verified." } }
    } finally { ssh.conn.close() }
  } catch { await markPlan(repairPlanId, "FAILED"); return { ok: false, error: "Git installation failed." } }
  await markPlan(repairPlanId, "COMPLETED")
  return { ok: true }
}

export async function runServerRepair(
  serverId: string,
  repairPlanId: string,
  repairActionId: string
): Promise<ServerRepairResult> {
  switch (repairActionId) {
    case "install_docker":
      return installDocker(repairPlanId, serverId)
    case "install_apache":
      return installApache(repairPlanId, serverId)
    case "install_git":
      return installGit(repairPlanId, serverId)
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
