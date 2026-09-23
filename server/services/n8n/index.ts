import type { Deployment, DeploymentStatus } from "../../db/generated/client"
import { prisma } from "../../db/prisma"
import { appendLog } from "../deployments/index"
import {
  createAndQueueJob,
  hasActiveJob,
  QUEUE_UNAVAILABLE,
} from "../deployment-job.service"
import { validateN8nConfig, type N8nConfigInput } from "./plans"
import { buildProgress, type N8nProgress } from "./progress"

export { buildProgress, N8N_STEPS } from "./progress"
export type { N8nProgress, ProgressStep } from "./progress"

/**
 * Managed n8n deployments.
 *
 * Every function takes the database userId first and puts it in the WHERE
 * clause, so a deployment belonging to someone else and one that does not
 * exist both come back null — the same rule the Vercel services follow.
 *
 * Nothing here runs Terraform. The API creates rows and returns; the worker
 * does the work.
 */

/** One at a time for normal users, because the bill lands on TisiOps. */
export const ACTIVE_LIMIT_MESSAGE =
  "You already have a managed n8n deployment. Delete it before creating another."

export const COST_WARNING =
  "This will create paid AWS resources in the TisiOps AWS account."

const FINISHED: DeploymentStatus[] = ["FAILED", "CANCELLED"]

/** Anything not finished still owns a server, so it counts against the limit. */
export async function countActiveN8n(userId: string): Promise<number> {
  return prisma.deployment.count({
    where: { userId, type: "N8N", status: { notIn: FINISHED } },
  })
}

export type CreateResult =
  { ok: true; deploymentId: string } | { ok: false; error: string }

/**
 * Records the approved deployment and queues the work.
 *
 * Returns as soon as the rows exist. The status is PENDING, not RUNNING: no
 * infrastructure exists yet, and saying otherwise would make the progress
 * screen lie for however long the worker takes to pick the job up.
 */
export async function createManagedN8nDeployment(input: {
  userId: string
  isAdmin: boolean
  config: N8nConfigInput
  targetServerId?: string | null
}): Promise<CreateResult> {
  const validated = validateN8nConfig(input.config)
  if (!validated.ok) return { ok: false, error: validated.error }

  const config = validated.config

  const target = input.targetServerId
    ? await prisma.server.findFirst({ where: { id: input.targetServerId, userId: input.userId }, select: { id: true, status: true, credentialsStored: true } })
    : null
  if (input.targetServerId && (!target || target.status !== "CONNECTED" || !target.credentialsStored)) {
    return { ok: false, error: "Select a connected server with stored SSH credentials." }
  }

  if (!input.isAdmin && (await countActiveN8n(input.userId)) > 0) {
    return { ok: false, error: ACTIVE_LIMIT_MESSAGE }
  }

  const deployment = await prisma.deployment.create({
    data: {
      userId: input.userId,
      type: "N8N",
      provider: target ? "BYOK_SERVER" : "TISIOPS_MANAGED_AWS",
      appName: config.workspaceName,
      template: "aws-n8n-server",
      status: "PENDING",
      domain: config.domain,
      costApprovedAt: new Date(),
      statusDetail: "Queued. A TisiOps worker will pick this up shortly.",
      n8nConfig: {
        create: {
          workspaceName: config.workspaceName,
          adminEmail: config.adminEmail,
          timezone: config.timezone,
          region: config.region,
          plan: config.plan,
          instanceType: config.instanceType,
          domainMode: config.domainMode,
          domain: config.domain,
          databaseType: "postgresdb",
          hostingMode: "TISIOPS_MANAGED",
        },
      },
    },
  })

  if (target) await prisma.server.update({ where: { id: target.id }, data: { deploymentId: deployment.id } })
  await appendLog(deployment.id, target ? "BYOK n8n deployment approved" : "n8n deployment approved", "SUCCESS")
  await appendLog(deployment.id, "Deployment record created", "INFO")

  // The config stays in Postgres. Redis receives the job id and nothing else,
  // so no secret or setting ever travels through the queue.
  const queued = await createAndQueueJob({
    deploymentId: deployment.id,
    type: "N8N_MANAGED_SERVER_DEPLOYMENT",
    payload: { ...config, targetServerId: target?.id },
  })

  await appendLog(
    deployment.id,
    "Deployment job created",
    "INFO",
    null,
    queued.job.id
  )

  if (!queued.ok) {
    // The Deployment survives: Postgres is the source of truth, so this is a
    // queueing failure the user can retry, not a lost deployment.
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: { status: "FAILED", statusDetail: QUEUE_UNAVAILABLE },
    })

    return { ok: false, error: QUEUE_UNAVAILABLE }
  }

  await appendLog(
    deployment.id,
    "Job added to Redis queue",
    "INFO",
    null,
    queued.job.id
  )
  await appendLog(
    deployment.id,
    "Waiting for worker",
    "INFO",
    null,
    queued.job.id
  )

  await prisma.deployment.update({
    where: { id: deployment.id },
    data: {
      status: "QUEUED",
      statusDetail: "Waiting for a TisiOps worker.",
    },
  })

  return { ok: true, deploymentId: deployment.id }
}

/**
 * Queues a fresh run for a failed deployment.
 *
 * The stored config is reused as-is, and the Terraform working directory and
 * its state are left in place: a retry re-applies over existing state rather
 * than creating a second instance.
 */
export async function retryManagedN8nDeployment(input: {
  userId: string
  deploymentId: string
}): Promise<CreateResult> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: input.deploymentId, userId: input.userId, type: "N8N" },
    include: { n8nConfig: true },
  })

  if (!deployment || !deployment.n8nConfig) {
    return { ok: false, error: "Deployment not found" }
  }

  if (await hasActiveJob(deployment.id)) {
    return { ok: false, error: "This deployment is already running." }
  }

  const stored = deployment.n8nConfig
  const validated = validateN8nConfig({
    workspaceName: stored.workspaceName,
    adminEmail: stored.adminEmail,
    timezone: stored.timezone,
    region: stored.region,
    plan: stored.plan,
    domainMode: stored.domainMode,
    domain: stored.domain,
  })

  // A config that no longer validates means the allowlists changed under it.
  // Refusing is right: the alternative is silently deploying something the
  // current rules would not approve.
  if (!validated.ok) {
    return {
      ok: false,
      error: `Saved settings are no longer allowed: ${validated.error}`,
    }
  }

  const queued = await createAndQueueJob({
    deploymentId: deployment.id,
    type: "RETRY_DEPLOYMENT",
    payload: { ...validated.config },
  })

  await appendLog(
    deployment.id,
    "Retry requested by user",
    "INFO",
    null,
    queued.job.id
  )

  if (!queued.ok) return { ok: false, error: QUEUE_UNAVAILABLE }

  await prisma.deployment.update({
    where: { id: deployment.id },
    data: {
      status: "QUEUED",
      statusDetail: "Retry queued.",
      retryCount: deployment.retryCount + 1,
      lastRetriedAt: new Date(),
    },
  })

  return { ok: true, deploymentId: deployment.id }
}

/** Null when the deployment is not this user's — same answer as "no such id". */
export async function getN8nProgress(
  userId: string,
  deploymentId: string
): Promise<N8nProgress | null> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, userId, type: "N8N" },
  })

  if (!deployment) return null

  const server = await prisma.server.findFirst({
    where: { deploymentId: deployment.id },
    orderBy: { createdAt: "desc" },
  })

  return buildProgress(
    deployment,
    server?.elasticIp ?? null,
    server?.status ?? null
  )
}

/** Safe server summary. Carries no credentials — there are none to carry. */
export async function getServerFor(userId: string, deploymentId: string) {
  const server = await prisma.server.findFirst({
    where: { deploymentId, deployment: { userId } },
    orderBy: { createdAt: "desc" },
  })

  if (!server) return null

  return {
    id: server.id,
    region: server.region,
    instanceType: server.instanceType,
    awsInstanceId: server.awsInstanceId,
    elasticIp: server.elasticIp,
    publicIp: server.publicIp,
    status: server.status,
    createdAt: server.createdAt.toISOString(),
  }
}
