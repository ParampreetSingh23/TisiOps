import { Queue, type JobsOptions } from "bullmq"

import { DEPLOYMENT_QUEUE, type DeploymentJobPayload } from "./deployment.types"
import { createRedis, describeRedisError, isRedisConfigured } from "./redis"

/**
 * The deployment queue.
 *
 * Tuned for the Redis Cloud 30 MB free tier: finished jobs are dropped almost
 * immediately, the event stream is capped, and the payload is three ids. The
 * history a user actually reads lives in Postgres — DeploymentJob and
 * DeploymentLog — so nothing is lost by discarding it here.
 */

/**
 * Kept small on purpose:
 *
 * - `attempts: 2` — one retry covers a dropped connection. More than that on a
 *   Terraform job means re-running an apply that may already have created
 *   infrastructure, which the handlers guard against but should not invite.
 * - `removeOnComplete/Fail` — the cap that keeps memory flat under the 30 MB
 *   limit. Postgres keeps the record.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 2,
  backoff: { type: "exponential", delay: 15_000 },
  removeOnComplete: { count: 50, age: 3_600 },
  removeOnFail: { count: 50, age: 86_400 },
}

let queue: Queue<DeploymentJobPayload> | null = null

/** One lazily-created queue per process — the API opens no socket until used. */
export function deploymentQueue(): Queue<DeploymentJobPayload> {
  if (!queue) {
    queue = new Queue<DeploymentJobPayload>(DEPLOYMENT_QUEUE, {
      connection: createRedis("tisiops-api"),
      streams: {
        // BullMQ's event stream grows unbounded by default and would eat the
        // free tier on its own. Nothing reads it; Postgres carries progress.
        events: { maxLen: 100 },
      },
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
  }

  return queue
}

export type EnqueueResult =
  { ok: true; queueJobId: string } | { ok: false; error: string }

/**
 * Publishes the notification.
 *
 * Never throws. A queue that is down, full, or unconfigured must not lose the
 * Deployment the caller just wrote, so the failure comes back as a value and
 * the caller records it in Postgres instead.
 */
export async function enqueueDeploymentJob(
  payload: DeploymentJobPayload
): Promise<EnqueueResult> {
  if (!isRedisConfigured()) {
    return {
      ok: false,
      error: "The deployment queue is not configured on this TisiOps instance.",
    }
  }

  try {
    const job = await deploymentQueue().add(payload.type, payload, {
      // The Postgres row id doubles as the Redis job id, so a double-submit
      // cannot queue the same work twice.
      jobId: payload.deploymentJobId,
    })

    return { ok: true, queueJobId: String(job.id) }
  } catch (error) {
    return { ok: false, error: describeRedisError(error) }
  }
}

export type QueueCounts = {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

/** Counts only — no job payloads, no connection details. */
export async function queueCounts(): Promise<QueueCounts | null> {
  if (!isRedisConfigured()) return null

  try {
    const counts = await deploymentQueue().getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed"
    )

    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
    }
  } catch {
    return null
  }
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close()
    queue = null
  }
}
