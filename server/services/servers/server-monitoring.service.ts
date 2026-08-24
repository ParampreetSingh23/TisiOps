import { prisma } from "../../db/prisma"
import { isPortOpen } from "./server-reachable"
import { serverAddress } from "./server-status"

export type MonitoringStatusValue =
  | "NOT_INSTALLED"
  | "INSTALLING"
  | "ACTIVE"
  | "FAILED"
  | "DISABLED"
  | "UPGRADING"

export const DEFAULT_MONITORING_INSTALL_PATH = "/opt/tisiops/monitoring"

export type ServerMonitoringUpdateData = {
  agentVersion?: string | null
  installPath?: string | null
  installedAt?: Date | null
  lastHeartbeatAt?: Date | null
  lastCheckedAt?: Date | null
  errorCode?: string | null
  errorMessage?: string | null
}

export type SafeMonitoringRecord = {
  id: string
  userId: string
  serverId: string
  status: string
  agentVersion: string | null
  installPath: string | null
  installedAt: Date | null
  lastHeartbeatAt: Date | null
  lastCheckedAt: Date | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * The server this monitoring status belongs to, verified to be owned by the
 * caller. Every function below scopes by userId so a guessed serverId resolves
 * to null — never to another user's server.
 */
async function ownedServer(userId: string, serverId: string) {
  return prisma.server.findFirst({
    where: { id: serverId, userId },
    select: { id: true },
  })
}

/**
 * Read the monitoring record for a server the caller owns, creating a default
 * `NOT_INSTALLED` row on first read. This is what legacy servers — connected
 * before monitoring existed — fall back to, so the UI always has a status.
 */
export async function getOrCreateServerMonitoring(
  userId: string,
  serverId: string
): Promise<SafeMonitoringRecord | null> {
  if (!(await ownedServer(userId, serverId))) return null

  const existing = await prisma.serverMonitoring.findFirst({
    where: { serverId, userId },
  })
  if (existing) return existing

  return prisma.serverMonitoring.create({
    data: {
      userId,
      serverId,
      status: "NOT_INSTALLED",
      installPath: DEFAULT_MONITORING_INSTALL_PATH,
    },
  })
}

/**
 * Read the monitoring record for a server the caller owns, without creating
 * one. Returns null when the server is not the caller's or has no record yet.
 */
export async function getServerMonitoring(
  userId: string,
  serverId: string
): Promise<SafeMonitoringRecord | null> {
  if (!(await ownedServer(userId, serverId))) return null

  return prisma.serverMonitoring.findFirst({
    where: { serverId, userId },
  })
}

/**
 * Update the monitoring status for a server the caller owns. Versions the row
 * if it does not exist yet, so the future Monitor button can safely flip a
 * legacy server straight into INSTALLING / ACTIVE / FAILED without a prior GET.
 */
export async function updateServerMonitoringStatus(
  userId: string,
  serverId: string,
  status: MonitoringStatusValue,
  data: ServerMonitoringUpdateData = {}
): Promise<SafeMonitoringRecord | null> {
  if (!(await ownedServer(userId, serverId))) return null

  return prisma.serverMonitoring.upsert({
    where: { serverId },
    create: {
      userId,
      serverId,
      status,
      installPath: data.installPath ?? DEFAULT_MONITORING_INSTALL_PATH,
      ...data,
    },
    update: { status, ...data },
  })
}

export function markMonitoringInstalling(userId: string, serverId: string) {
  return updateServerMonitoringStatus(userId, serverId, "INSTALLING")
}

export type EnableMonitoringResult =
  | { ok: false }
  | { ok: false; status: number; error: string }
  | {
      ok: true
      record: SafeMonitoringRecord
      /** True when status actually moved to INSTALLING (so a job is queued). */
      transitioned: boolean
      /** The status before the transition, used to revert if the queue fails. */
      priorStatus: MonitoringStatusValue
    }

export function monitoringEnableBlockedReason(input: {
  serverStatus: string
  credentialsStored: boolean
  portOpen?: boolean
}): string | null {
  if (!input.credentialsStored) {
    return "Save SSH credentials before enabling monitoring."
  }
  if (input.portOpen === false) {
    return "The server is unreachable from the worker."
  }
  if (input.serverStatus !== "CONNECTED") {
    return "Server must be connected before enabling monitoring."
  }
  return null
}

/**
 * Flip a server's monitoring status to INSTALLING, but only from the states
 * that allow it (NOT_INSTALLED, FAILED, DISABLED). Returns whether a real
 * transition happened so the caller queues exactly one install job.
 *
 * Idempotent by construction: when status is already INSTALLING, ACTIVE, or
 * UPGRADING it returns the existing row with `transitioned: false`, so
 * repeated requests can never spawn a second installation or a duplicate
 * monitoring record. The caller still guards the queue with a deterministic
 * jobId as a second layer.
 */
export async function enableServerMonitoring(
  userId: string,
  serverId: string
): Promise<EnableMonitoringResult> {
  const server = await prisma.server.findFirst({
    where: { id: serverId, userId },
    select: {
      id: true,
      status: true,
      elasticIp: true,
      publicIp: true,
      host: true,
      sshPort: true,
      credentialsStored: true,
    },
  })
  if (!server) return { ok: false }

  const host = serverAddress(server)
  const portOpen = host ? await isPortOpen(host, server.sshPort || 22, 5000) : false
  const blockedReason = monitoringEnableBlockedReason({
    serverStatus: server.status,
    credentialsStored: server.credentialsStored,
    portOpen,
  })
  if (blockedReason) return { ok: false, status: 409, error: blockedReason }

  const existing = await prisma.serverMonitoring.findFirst({
    where: { serverId, userId },
  })
  const priorStatus = (existing?.status ?? "NOT_INSTALLED") as MonitoringStatusValue

  // Already in flight or done: no new action, return the current state.
  if (priorStatus === "INSTALLING" || priorStatus === "ACTIVE" || priorStatus === "UPGRADING") {
    return {
      ok: true,
      record: existing!,
      transitioned: false,
      priorStatus,
    }
  }

  const record = await prisma.serverMonitoring.upsert({
    where: { serverId },
    create: {
      userId,
      serverId,
      status: "INSTALLING",
      installPath: DEFAULT_MONITORING_INSTALL_PATH,
    },
    update: { status: "INSTALLING" },
  })

  return { ok: true, record, transitioned: true, priorStatus }
}

export async function markMonitoringActive(
  userId: string,
  serverId: string,
  agentVersion?: string
) {
  const data: ServerMonitoringUpdateData = {
    installedAt: new Date(),
    lastHeartbeatAt: new Date(),
  }
  if (agentVersion) data.agentVersion = agentVersion
  return updateServerMonitoringStatus(userId, serverId, "ACTIVE", data)
}

export function markMonitoringFailed(
  userId: string,
  serverId: string,
  errorCode: string,
  errorMessage?: string
) {
  return updateServerMonitoringStatus(userId, serverId, "FAILED", {
    errorCode,
    errorMessage: errorMessage ?? null,
  })
}
