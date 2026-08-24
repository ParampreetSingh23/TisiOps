import { hostname } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { Worker, type Job } from "bullmq"

import { prisma } from "../db/prisma"
import {
  MONITORING_QUEUE,
  type MonitoringJobPayload,
} from "../queues/monitoring.queue"
import {
  createRedis,
  isRedisConfigured,
  MISSING_REDIS_URL,
  redisTarget,
} from "../queues/redis"
import { collectServerMetrics } from "../services/servers/metrics-collector"
import { runMonitoringInstall } from "../services/servers/monitoring-install.runner"
import { discoverProductionRuntime } from "../services/servers/production-runtime"
import { runStagingSetup } from "../services/servers/staging-setup"
import { runServerRepair } from "./handlers/repairServer.handler"

const WORKER_ID = `${hostname()}-${process.pid}`
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 1)

function log(message: string): void {
  console.log(`[monitoring-worker ${WORKER_ID}] ${new Date().toISOString()} ${message}`)
}

async function process_(job: Job<MonitoringJobPayload>): Promise<void> {
  if (job.data.jobType === "COLLECT_SERVER_METRICS") {
    log("Collecting server metrics")
    await collectServerMetrics(job.data.serverId)
    return
  }

  if (job.data.jobType === "REPAIR_SERVER") {
    const result = await runServerRepair(
      job.data.serverId,
      job.data.repairPlanId,
      job.data.repairActionId
    )
    log(result.ok ? "Server repair completed" : `Server repair failed: ${result.error}`)
    return
  }

  if (job.data.jobType === "DISCOVER_PRODUCTION") {
    const result = await discoverProductionRuntime({
      userId: job.data.userId,
      serverId: job.data.serverId,
      stagingSessionId: job.data.stagingSessionId,
    })
    log(result.ok ? "Production discovery completed" : `Production discovery failed: ${result.error}`)
    return
  }

  if (job.data.jobType === "PROVISION_STAGING") {
    if (!job.data.serverId) {
      log("NEW_SERVER staging requires AWS provisioning first — deferred (execution in later phase)")
      return
    }
    const result = await runStagingSetup({
      userId: job.data.userId,
      targetServerId: job.data.serverId,
      stagingSessionId: job.data.stagingSessionId,
    })
    log(result.ok ? "Staging setup completed" : `Staging setup failed: ${result.error}`)
    return
  }

  // Narrowed to the install payload by the branches above.
  await processInstall(job.data)
}

async function processInstall(data: {
  serverId: string
  monitoringId: string
  jobType: "ENABLE_SERVER_MONITORING"
}): Promise<void> {
  await runMonitoringInstall(data.serverId, data.monitoringId, log)
}

export type RunningWorker = { stop: () => Promise<void> }

/** Starts the worker and returns a handle; null when Redis is unconfigured. */
export async function startMonitoringWorker(): Promise<RunningWorker | null> {
  if (!isRedisConfigured()) {
    console.error(`[monitoring-worker] ${MISSING_REDIS_URL}`)
    return null
  }

  log(`starting — redis ${redisTarget()}, concurrency ${CONCURRENCY}`)

  const worker = new Worker<MonitoringJobPayload>(MONITORING_QUEUE, process_, {
    connection: createRedis("tisiops-monitoring-worker", { failFast: false }),
    concurrency: CONCURRENCY,
    removeOnComplete: { count: 50, age: 3_600 },
    removeOnFail: { count: 50, age: 86_400 },
  })

  worker.on("ready", () => log("connected to Redis Cloud"))
  worker.on("failed", (job, error) => {
    console.error(`[monitoring-worker] job ${job?.id} failed:`, error?.message)
  })
  worker.on("error", (error) => {
    console.error("[monitoring-worker] redis error:", error.message)
  })

  return {
    stop: async () => {
      await worker.close()
    },
  }
}

async function main(): Promise<void> {
  const running = await startMonitoringWorker()
  if (!running) process.exit(1)

  const stop = async (signal: string) => {
    log(`${signal} received — finishing the current monitoring job, then exiting`)
    await running.stop()
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on("SIGINT", () => void stop("SIGINT"))
  process.on("SIGTERM", () => void stop("SIGTERM"))
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isDirectRun) {
  main().catch((error) => {
    console.error("[monitoring-worker] fatal", error)
    process.exit(1)
  })
}
