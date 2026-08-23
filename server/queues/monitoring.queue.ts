import { Queue, type JobsOptions } from "bullmq"

import { createRedis, describeRedisError, isRedisConfigured } from "./redis"

/**
 * The monitoring queue: a tiny sibling of the deployment queue.
 *
 * Unlike deployments, monitoring has no Postgres job row — ServerMonitoring is
 * the source of truth and this queue is pure transport. The deterministic
 * jobId below means a repeated enable can never enqueue a second install.
 */

export const MONITORING_QUEUE = "monitoringQueue"

export type MonitoringJobPayload =
  | { serverId: string; monitoringId: string; jobType: "ENABLE_SERVER_MONITORING" }
  | { serverId: string; jobType: "COLLECT_SERVER_METRICS" }
  | {
      serverId: string
      repairPlanId: string
      repairActionId: string
      jobType: "REPAIR_SERVER"
    }

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 2,
  backoff: { type: "exponential", delay: 15_000 },
  removeOnComplete: { count: 50, age: 3_600 },
  removeOnFail: { count: 50, age: 86_400 },
}

let queue: Queue<MonitoringJobPayload> | null = null

export function serverMetricsJobId(serverId: string): string {
  return `server-metrics-${serverId}`
}

function monitoringQueue(): Queue<MonitoringJobPayload> {
  if (!queue) {
    queue = new Queue<MonitoringJobPayload>(MONITORING_QUEUE, {
      connection: createRedis("tisiops-monitoring-api", { failFast: false }),
      streams: { events: { maxLen: 100 } },
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
  }
  return queue
}

export type EnqueueResult =
  | { ok: true; queueJobId: string }
  | { ok: false; error: string }

/**
 * Queues one monitoring install per server.
 *
 * The jobId folds the server in, so BullMQ treats a second add for the same
 * server as a no-op — the reliable guard against a double-click or a double
 * submit creating two installs. Never throws; a queue that is down returns a
 * value so the caller can leave the status consistent.
 */
export async function enqueueMonitoringInstall(
  serverId: string,
  monitoringId: string
): Promise<EnqueueResult> {
  if (!isRedisConfigured()) {
    return { ok: false, error: "The monitoring queue is not configured." }
  }

  try {
    const job = await monitoringQueue().add(
      "ENABLE_SERVER_MONITORING",
      { serverId, monitoringId, jobType: "ENABLE_SERVER_MONITORING" },
      { jobId: `monitoring-install:${serverId}` }
    )
    return { ok: true, queueJobId: String(job.id) }
  } catch (error) {
    return { ok: false, error: describeRedisError(error) }
  }
}

export async function closeMonitoringQueue(): Promise<void> {
  if (queue) {
    await queue.close()
    queue = null
  }
}

/**
 * Ensures the recurring snapshot collection schedule for one server exists.
 * The deterministic jobId means a duplicate add is a no-op, so repeated calls
 * can never create a second schedule.
 */
export async function ensureServerMetricsSchedule(
  serverId: string
): Promise<EnqueueResult> {
  if (!isRedisConfigured()) {
    return { ok: false, error: "The monitoring queue is not configured." }
  }

  try {
    const job = await monitoringQueue().upsertJobScheduler(
      serverMetricsJobId(serverId),
      { every: 60_000 },
      {
        name: "COLLECT_SERVER_METRICS",
        data: { serverId, jobType: "COLLECT_SERVER_METRICS" },
      }
    )
    return { ok: true, queueJobId: String(job.id) }
  } catch (error) {
    return { ok: false, error: describeRedisError(error) }
  }
}

/** Stops the recurring collection schedule for a server. Best-effort. */
export async function removeServerMetricsSchedule(serverId: string): Promise<void> {
  if (!isRedisConfigured()) return
  try {
    await monitoringQueue().removeJobScheduler(serverMetricsJobId(serverId))
  } catch {
    // Best-effort: the collector also stops itself when monitoring is not ACTIVE.
  }
}

/**
 * Queues one fixed server repair handler. Idempotent per repair plan: the
 * jobId folds the plan in, so a re-approval cannot queue the same repair twice.
 * The payload is ids only — no commands or credentials.
 */
export async function enqueueServerRepair(
  serverId: string,
  repairPlanId: string,
  repairActionId: string
): Promise<EnqueueResult> {
  if (!isRedisConfigured()) {
    return { ok: false, error: "The monitoring queue is not configured." }
  }
  try {
    const job = await monitoringQueue().add(
      "REPAIR_SERVER",
      { serverId, repairPlanId, repairActionId, jobType: "REPAIR_SERVER" },
      { jobId: `server-repair:${repairPlanId}` }
    )
    return { ok: true, queueJobId: String(job.id) }
  } catch (error) {
    return { ok: false, error: describeRedisError(error) }
  }
}
