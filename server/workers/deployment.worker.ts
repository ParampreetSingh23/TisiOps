import { hostname } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { Worker, type Job } from "bullmq"

import type { DeploymentStatus, JobType } from "../db/generated/client"
import { prisma } from "../db/prisma"
import { initOpenTelemetry, shutdownOpenTelemetry } from "../services/observability/otel"
import {
  deploymentFailedTotal,
  deploymentSuccessTotal,
  deploymentTotal,
  workerJobDurationMs,
  workerJobFailedTotal,
} from "../services/observability/metrics"
import { withSpan } from "../services/observability/trace"
import {
  DEPLOYMENT_QUEUE,
  type DeploymentJobPayload,
} from "../queues/deployment.types"
import {
  createRedis,
  isRedisConfigured,
  MISSING_REDIS_URL,
  redisTarget,
} from "../queues/redis"
import {
  finishJob,
  markJobRunning,
  recoverStuckJobs,
  requeueOrphanedJobs,
} from "../services/deployment-job.service"
import { jobLogger } from "../services/deployment-log.service"
import { awsAppDeploymentHandler } from "./handlers/awsAppDeployment.handler"
import { n8nManagedDeploymentHandler } from "./handlers/n8nManagedDeployment.handler"
import { postgresManagedDeploymentHandler } from "./handlers/postgresManagedDeployment.handler"
import { repairDeploymentHandler } from "./handlers/repairDeployment.handler"
import { retryDeploymentHandler } from "./handlers/retryDeployment.handler"
import {
  serverStartHandler,
  serverStopHandler,
} from "./handlers/serverPower.handler"
import { terraformDestroyHandler } from "./handlers/terraformDestroy.handler"
import { vercelDeleteHandler } from "./handlers/vercelDelete.handler"
import { vercelDeploymentHandler } from "./handlers/vercelDeployment.handler"
import type { Handler } from "./handlers/types"
import { startMonitoringWorker } from "./monitoring.worker"

initOpenTelemetry()

/**
 * The TisiOps deployment worker. Start with `npm run worker`.
 *
 * The only place long-running deployment work happens. Terraform applies, build
 * polls, and health checks all take minutes, which no HTTP request survives —
 * the API writes a Postgres row and publishes its id, and this process does
 * the work and writes the result back to Postgres.
 *
 * Deploy it separately from the frontend. On Vercel there is nowhere for it to
 * live; it needs a long-running host such as Render, Railway, Fly.io, or EC2.
 */

const WORKER_ID = `${hostname()}-${process.pid}`

/**
 * One job at a time.
 *
 * Terraform applies against shared AWS state and are the expensive thing here.
 * Ten simultaneous deployments should mean one running and nine waiting, not
 * ten applies competing — so the queue absorbs the burst rather than the
 * account doing it.
 */
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 1)

const HANDLERS: Record<JobType, Handler> = {
  VERCEL_DEPLOYMENT: vercelDeploymentHandler,
  AWS_APP_DEPLOYMENT: awsAppDeploymentHandler,
  N8N_MANAGED_SERVER_DEPLOYMENT: n8nManagedDeploymentHandler,
  POSTGRES_MANAGED_SERVER_DEPLOYMENT: postgresManagedDeploymentHandler,
  RETRY_DEPLOYMENT: retryDeploymentHandler,
  REPAIR_DEPLOYMENT: repairDeploymentHandler,
  TERRAFORM_DESTROY: terraformDestroyHandler,
  SERVER_STOP: serverStopHandler,
  SERVER_START: serverStartHandler,
  VERCEL_DELETE: vercelDeleteHandler,
}

/** The status a deployment moves to while its job runs. */
const RUNNING_STATUS: Record<JobType, DeploymentStatus> = {
  VERCEL_DEPLOYMENT: "BUILDING",
  AWS_APP_DEPLOYMENT: "PROVISIONING_INFRA",
  N8N_MANAGED_SERVER_DEPLOYMENT: "RUNNING",
  POSTGRES_MANAGED_SERVER_DEPLOYMENT: "RUNNING",
  RETRY_DEPLOYMENT: "RETRYING",
  REPAIR_DEPLOYMENT: "RUNNING",
  TERRAFORM_DESTROY: "RUNNING",
  SERVER_STOP: "STOPPING",
  SERVER_START: "STARTING",
  VERCEL_DELETE: "RUNNING",
}

function log(message: string): void {
  console.log(`[worker ${WORKER_ID}] ${new Date().toISOString()} ${message}`)
}

/**
 * Runs one job.
 *
 * The Redis message is not trusted for anything but the id: the row is read
 * from Postgres and checked before any work starts, so a stale or replayed
 * message cannot re-run finished work.
 */
async function process_(job: Job<DeploymentJobPayload>): Promise<void> {
  const started = Date.now()
  const { deploymentJobId } = job.data

  return withSpan(
    "worker.job.process",
    {
      deploymentId: job.data.deploymentId,
      deploymentJobId,
      jobType: job.data.type,
      workerId: WORKER_ID,
    },
    async () => {
      const row = await withSpan(
        "worker.job.load_from_postgres",
        { deploymentJobId, workerId: WORKER_ID },
        () =>
          prisma.deploymentJob.findUnique({
            where: { id: deploymentJobId },
          })
      )

      if (!row) {
        log(`job ${deploymentJobId} has no Postgres row — dropping`)
        return
      }

      if (row.status === "SUCCESS" || row.status === "CANCELLED") {
        log(`job ${row.id} is already ${row.status} — dropping`)
        return
      }

      deploymentTotal.add(1, { jobType: row.type })
      const write = jobLogger(row.deploymentId, row.id)

      await withSpan(
        "worker.job.mark_running",
        {
          deploymentId: row.deploymentId,
          deploymentJobId: row.id,
          jobType: row.type,
          workerId: WORKER_ID,
        },
        () => markJobRunning(row.id, WORKER_ID)
      )
      await write("Worker picked job", "SUCCESS")
      await write("Job started")

      await prisma.deployment.update({
        where: { id: row.deploymentId },
        data: { status: RUNNING_STATUS[row.type] },
      })

      const handler = HANDLERS[row.type]
      const fresh = await prisma.deploymentJob.findUniqueOrThrow({
        where: { id: row.id },
      })

      const result = await withSpan(
        "worker.job.dispatch_handler",
        {
          deploymentId: row.deploymentId,
          deploymentJobId: row.id,
          jobType: row.type,
          workerId: WORKER_ID,
        },
        () =>
          handler({
            job: fresh,
            deploymentId: row.deploymentId,
            log: write,
          })
      )

      if (result.ok) {
        await withSpan(
          "worker.job.mark_success",
          { deploymentId: row.deploymentId, deploymentJobId: row.id, jobType: row.type },
          () => finishJob(row.id, "SUCCESS")
        )
        workerJobDurationMs.record(Date.now() - started, { jobType: row.type, status: "SUCCESS" })
        deploymentSuccessTotal.add(1, { jobType: row.type })
        await write("Job completed", "SUCCESS")
        log(`job ${row.id} succeeded`)
        return
      }

      await withSpan(
        "worker.job.mark_failed",
        { deploymentId: row.deploymentId, deploymentJobId: row.id, jobType: row.type },
        () => finishJob(row.id, "FAILED", result.error)
      )
      workerJobDurationMs.record(Date.now() - started, { jobType: row.type, status: "FAILED" })
      workerJobFailedTotal.add(1, { jobType: row.type })
      deploymentFailedTotal.add(1, { jobType: row.type })
      await write(`Job failed: ${result.error}`, "ERROR")

      // The handler may already have set a more specific status — WAITING_FOR_DNS,
      // ACCESS_BLOCKED — so only a still-running deployment is forced to FAILED.
      const current = await prisma.deployment.findUnique({
        where: { id: row.deploymentId },
        select: { status: true },
      })

  const unfinished: DeploymentStatus[] = [
    "QUEUED",
    "PENDING",
    "RUNNING",
    "RETRYING",
    "BUILDING",
    "DEPLOYING",
    "PROVISIONING_INFRA",
    "BOOTSTRAPPING_SERVER",
    "CONFIGURING_N8N",
    "CONFIGURING_SSL",
    "HEALTH_CHECKING",
    "STOPPING",
    "STARTING",
  ]

      if (current && unfinished.includes(current.status)) {
        await prisma.deployment.update({
          where: { id: row.deploymentId },
          data: { status: "FAILED", statusDetail: result.error },
        })
      }

      log(`job ${row.id} failed`)

      // Thrown so BullMQ counts the attempt and applies its backoff. The user-facing
      // record is already written above, so this only drives the retry.
      throw new Error(result.error)
    }
  )
}

/** Direct in-process execution fallback when Redis worker is unavailable or offline. */
export async function executeJobDirectly(jobId: string): Promise<void> {
  const row = await prisma.deploymentJob.findUnique({
    where: { id: jobId },
  })

  if (!row) return
  if (row.status === "SUCCESS" || row.status === "CANCELLED" || row.status === "RUNNING") return

  const workerId = `in-process-${process.pid}`
  const write = jobLogger(row.deploymentId, row.id)

  await markJobRunning(row.id, workerId)
  await write("Worker picked job", "SUCCESS")
  await write("Job started")

  await prisma.deployment.update({
    where: { id: row.deploymentId },
    data: { status: RUNNING_STATUS[row.type] },
  })

  try {
    const handler = HANDLERS[row.type]
    const fresh = await prisma.deploymentJob.findUniqueOrThrow({
      where: { id: row.id },
    })

    const result = await handler({
      job: fresh,
      deploymentId: row.deploymentId,
      log: write,
    })

    if (result.ok) {
      await finishJob(row.id, "SUCCESS")
      await write("Job completed", "SUCCESS")
      log(`job ${row.id} succeeded`)
      return
    }

    await finishJob(row.id, "FAILED", result.error)
    await write(`Job failed: ${result.error}`, "ERROR")

    const current = await prisma.deployment.findUnique({
      where: { id: row.deploymentId },
      select: { status: true },
    })

    const unfinished: DeploymentStatus[] = [
      "QUEUED",
      "PENDING",
      "RUNNING",
      "RETRYING",
      "BUILDING",
      "DEPLOYING",
      "PROVISIONING_INFRA",
      "BOOTSTRAPPING_SERVER",
      "CONFIGURING_N8N",
      "CONFIGURING_SSL",
      "HEALTH_CHECKING",
      "STOPPING",
      "STARTING",
    ]

    if (current && unfinished.includes(current.status)) {
      await prisma.deployment.update({
        where: { id: row.deploymentId },
        data: { status: "FAILED", statusDetail: result.error },
      })
    }
  } catch (cause) {
    const errorMsg = (cause as Error).message
    await finishJob(row.id, "FAILED", errorMsg)
    await write(`Job failed: ${errorMsg}`, "ERROR")
  }
}

export type RunningWorker = { stop: () => Promise<void> }

/**
 * Starts the worker and returns a handle.
 *
 * Exported so the API can run it in the same process — see index.ts. Terraform
 * runs through `spawn`, so a job is I/O-bound from Node's point of view and
 * does not block the HTTP server. It is still never run inside a request: the
 * queue is what separates the two.
 *
 * Returns null instead of throwing when Redis is unconfigured, so an API that
 * embeds it still starts and serves everything that does not need the queue.
 */
export async function startDeploymentWorker(): Promise<RunningWorker | null> {
  if (!isRedisConfigured()) {
    console.error(`[worker] ${MISSING_REDIS_URL}`)
    return null
  }

  log(`starting — redis ${redisTarget()}, concurrency ${CONCURRENCY}`)

  const recovered = await recoverStuckJobs()
  if (recovered > 0) log(`recovered ${recovered} stuck job(s)`)

  /**
   * Postgres is the source of truth, so it can repair the queue.
   *
   * Redis Cloud ships with `volatile-lru`, which evicts under memory pressure —
   * a dropped key would otherwise leave a deployment queued forever. This sweep
   * re-publishes anything Postgres still expects. Set the database's eviction
   * policy to `noeviction` to make it a formality rather than a necessity.
   */
  const sweep = setInterval(() => {
    void requeueOrphanedJobs()
      .then((count) => count > 0 && log(`re-queued ${count} orphaned job(s)`))
      .catch(() => log("orphan sweep failed — will try again"))

    // Also on a timer, not only at start: a job orphaned while this worker was
    // already running would otherwise hold its deployment in a mid-flight
    // state until the next restart.
    void recoverStuckJobs()
      .then((count) => count > 0 && log(`recovered ${count} stuck job(s)`))
      .catch(() => log("stuck-job sweep failed — will try again"))
  }, 60_000)
  sweep.unref()

  const worker = new Worker<DeploymentJobPayload>(DEPLOYMENT_QUEUE, process_, {
    connection: createRedis("tisiops-worker", { failFast: false }),
    concurrency: CONCURRENCY,
    // Matches the queue's cleanup so retained jobs cannot grow past the free
    // tier from this side either.
    removeOnComplete: { count: 50, age: 3_600 },
    removeOnFail: { count: 50, age: 86_400 },
  })

  worker.on("ready", () => log("connected to Redis Cloud"))
  worker.on("failed", (job, error) => {
    // Full detail to stdout only — never to the database or the browser.
    console.error(`[worker] job ${job?.id} failed:`, error?.message)
  })
  worker.on("error", (error) => {
    console.error("[worker] redis error:", error.message)
  })

  return {
    // Waits for the in-flight job: killing a Terraform apply between creating
    // resources and reading its outputs is what orphans infrastructure.
    stop: async () => {
      clearInterval(sweep)
      await worker.close()
    },
  }
}

/**
 * Standalone entry point, for `npm run worker`.
 *
 * Runs only when this file is executed directly, so importing it from the API
 * starts nothing on its own.
 */
async function main(): Promise<void> {
  const running = await startDeploymentWorker()
  if (!running) process.exit(1)

  const monitoringWorker = await startMonitoringWorker()

  const stop = async (signal: string) => {
    log(`${signal} received — finishing the current job, then exiting`)
    await running.stop()
    await monitoringWorker?.stop()
    await shutdownOpenTelemetry()
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on("SIGINT", () => void stop("SIGINT"))
  process.on("SIGTERM", () => void stop("SIGTERM"))
}

// `import.meta.main` is not available on this Node version, so the entry point
// is detected by comparing the resolved path argv gave us.
const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isDirectRun) {
  main().catch((error) => {
    console.error("[worker] fatal", error)
    process.exit(1)
  })
}
