import type {
  DeploymentJob,
  DeploymentStatus,
  JobType,
} from "../db/generated/client"
import { prisma } from "../db/prisma"
import { enqueueDeploymentJob } from "../queues/deployment.queue"
import { logToDeployment } from "./deployment-log.service"
import { redisQueueJobTotal } from "./observability/metrics"
import { logDeploymentStep } from "./observability/deployment-spans"
import { withSpan } from "./observability/trace"

/**
 * The Postgres side of the queue.
 *
 * A job exists here first and is published to Redis second. If the publish
 * fails, the row survives with the reason on it — the deployment is never lost
 * because the queue was down or full.
 */

export const QUEUE_UNAVAILABLE =
  "The deployment was saved but could not be queued. Retry once the queue is available."

export type SafeJob = {
  id: string
  type: JobType
  status: DeploymentJob["status"]
  attempts: number
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

/** No payload, no lock owner — those describe infrastructure, not the user's job. */
export function toSafeJob(row: DeploymentJob): SafeJob {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export type QueuedJob =
  | { ok: true; job: DeploymentJob }
  | { ok: false; job: DeploymentJob; error: string }

/**
 * Creates the job row, then publishes its id.
 *
 * `payload` stays in Postgres and is never sent to Redis. The Redis message is
 * the two ids and the type.
 */
export async function createAndQueueJob(input: {
  deploymentId: string
  type: JobType
  payload: Record<string, unknown>
}): Promise<QueuedJob> {
  return withSpan(
    "deployment.job.created",
    {
      deploymentId: input.deploymentId,
      jobType: input.type,
    },
    async () => {
      const job = await prisma.deploymentJob.create({
        data: {
          deploymentId: input.deploymentId,
          type: input.type,
          status: "PENDING",
          payloadJson: input.payload as never,
        },
      })

      await logDeploymentStep({
        deploymentId: input.deploymentId,
        jobId: job.id,
        step: "deployment.job.created",
        status: "success",
        message: "Deployment job created",
        attrs: { deploymentJobId: job.id, jobType: input.type },
      })

      const published = await withSpan(
        "deployment.redis.queued",
        {
          deploymentId: input.deploymentId,
          deploymentJobId: job.id,
          jobType: input.type,
        },
        () =>
          enqueueDeploymentJob({
            deploymentJobId: job.id,
            deploymentId: input.deploymentId,
            type: input.type,
          })
      )

      if (!published.ok) {
        // Redis queue is not available: fallback to in-process execution runner.
        const queued = await prisma.deploymentJob.update({
          where: { id: job.id },
          data: { status: "QUEUED", errorMessage: null },
        })

        await logDeploymentStep({
          deploymentId: input.deploymentId,
          jobId: job.id,
          step: "deployment.redis.queued",
          status: "failed",
          message:
            "Redis queue unavailable — executing job in backend process runner",
          errorCode: "REDIS_QUEUE_UNAVAILABLE",
          attrs: { deploymentJobId: job.id, jobType: input.type },
        })

        // Import lazily to avoid circular dependency
        import("../workers/deployment.worker").then(({ executeJobDirectly }) => {
          setImmediate(() => {
            void executeJobDirectly(job.id)
          })
        }).catch(() => {})

        return { ok: true, job: queued }
      }

      const queued = await prisma.deploymentJob.update({
        where: { id: job.id },
        data: { status: "QUEUED", errorMessage: null },
      })

      redisQueueJobTotal.add(1, { jobType: input.type })
      await logDeploymentStep({
        deploymentId: input.deploymentId,
        jobId: job.id,
        step: "deployment.redis.queued",
        status: "success",
        message: "Job added to Redis Cloud queue",
        attrs: { deploymentJobId: job.id, jobType: input.type },
      })

      return { ok: true, job: queued }
    }
  )
}

export async function markJobRunning(
  jobId: string,
  workerId: string
): Promise<DeploymentJob> {
  return prisma.deploymentJob.update({
    where: { id: jobId },
    data: {
      status: "RUNNING",
      lockedAt: new Date(),
      lockedBy: workerId,
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  })
}

export async function finishJob(
  jobId: string,
  status: "SUCCESS" | "FAILED" | "CANCELLED",
  errorMessage?: string | null
): Promise<void> {
  await prisma.deploymentJob.update({
    where: { id: jobId },
    data: {
      status,
      errorMessage: errorMessage ?? null,
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  })
}

/**
 * Jobs a killed worker left marked RUNNING.
 *
 * They are failed rather than re-queued. Every handler here touches real
 * infrastructure, and re-running one automatically after a crash — without
 * knowing how far it got — is how a second EC2 instance appears. The user
 * retries deliberately, which routes through the retry handler and its
 * existing Terraform state.
 */
export async function recoverStuckJobs(staleMinutes = 45): Promise<number> {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000)

  const stuck = await prisma.deploymentJob.findMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    select: { id: true, deploymentId: true },
  })

  for (const job of stuck) {
    await logToDeployment({
      deploymentId: job.deploymentId,
      jobId: job.id,
      message:
        "Job recovered after worker restart. It did not finish — retry to run it again.",
      level: "WARNING",
    })

    await finishJob(
      job.id,
      "FAILED",
      "The worker stopped before this job finished. Retry to run it again."
    )

    await prisma.deployment.update({
      where: { id: job.deploymentId },
      data: {
        status: "FAILED",
        statusDetail: "The worker stopped before this deployment finished.",
      },
    })
  }

  return stuck.length
}

/**
 * Re-publishes jobs Postgres still expects but Redis has forgotten.
 *
 * Two ways that happens on the free tier: the enqueue failed and the row
 * stayed PENDING, or Redis evicted the key — Redis Cloud defaults to
 * `volatile-lru`, not `noeviction`, so under memory pressure it drops queue
 * data. Either way the deployment would wait forever on a notification that no
 * longer exists.
 *
 * Safe to run repeatedly: the Redis job id is the Postgres row id, so
 * re-publishing something still queued is a no-op rather than a second run.
 */
export async function requeueOrphanedJobs(
  olderThanMinutes = 2
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000)

  const orphans = await prisma.deploymentJob.findMany({
    where: { status: { in: ["PENDING", "QUEUED"] }, createdAt: { lt: cutoff } },
    select: { id: true, deploymentId: true, type: true, status: true },
  })

  let republished = 0

  for (const job of orphans) {
    const published = await enqueueDeploymentJob({
      deploymentJobId: job.id,
      deploymentId: job.deploymentId,
      type: job.type,
    })

    if (!published.ok) continue

    republished += 1

    if (job.status === "PENDING") {
      await prisma.deploymentJob.update({
        where: { id: job.id },
        data: { status: "QUEUED", errorMessage: null },
      })
      await logToDeployment({
        deploymentId: job.deploymentId,
        jobId: job.id,
        message: "Job added to Redis Cloud queue",
      })
    }
  }

  return republished
}

/** Scoped through the deployment, so job history cannot leak by id. */
export async function listJobsForDeployment(
  userId: string,
  deploymentId: string
): Promise<SafeJob[] | null> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, userId },
    select: { id: true },
  })

  if (!deployment) return null

  const jobs = await prisma.deploymentJob.findMany({
    where: { deploymentId },
    orderBy: { createdAt: "asc" },
  })

  return jobs.map(toSafeJob)
}

export async function hasActiveJob(deploymentId: string): Promise<boolean> {
  const count = await prisma.deploymentJob.count({
    where: {
      deploymentId,
      status: { in: ["PENDING", "QUEUED", "RUNNING"] },
    },
  })

  return count > 0
}
