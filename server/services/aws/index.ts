/**
 * Creating and re-running a plain AWS server deployment.
 *
 * The order here is deliberate and matches every other deployment type: the
 * Postgres row exists before anything is published to Redis, so a queue outage
 * leaves a visible failed deployment rather than a silent no-op.
 *
 * Unlike n8n and PostgreSQL there is no dedicated config table. Those exist to
 * hold encrypted secrets (database passwords, connection strings); a plain
 * server has none, so the validated config lives in DeploymentJob.payloadJson,
 * which is already durable and already excluded from the Redis message.
 */

import type { DeploymentStatus } from "../../db/generated/client"
import { prisma } from "../../db/prisma"
import {
  createAndQueueJob,
  hasActiveJob,
  QUEUE_UNAVAILABLE,
} from "../deployment-job.service"
import { appendLog } from "../deployments/index"
import { buildProgress, type N8nProgress } from "../n8n/progress"
import { getAwsConnectionStatus } from "../provider-connections/index"
import {
  missingUserSecrets,
  stagingPayloadFromPlan,
} from "../servers/staging-execution"
import type { FinalStagingPlan } from "../servers/staging-planning"
import {
  AWS_SERVER_STEPS,
  AWS_SERVER_TEMPLATE,
  validateAwsServerConfig,
  type AwsServerConfig,
  type AwsServerConfigInput,
} from "./plans"

export const COST_WARNING =
  "This creates a real EC2 instance and a static Elastic IP in your own AWS account. AWS bills you for both from the moment they exist, including while the server is stopped."

export const PUBLIC_SERVER_WARNING =
  "Ports 80 and 443 will be open to the internet. SSH is restricted to the TisiOps worker address."

const FINISHED: DeploymentStatus[] = ["FAILED", "CANCELLED"]

/** Statuses that mean a deployment is still alive and still costing money. */
const UNFINISHED: DeploymentStatus[] = [
  "PENDING",
  "QUEUED",
  "RUNNING",
  "PLANNING",
  "PROVISIONING_INFRA",
  "BOOTSTRAPPING_SERVER",
  "HEALTH_CHECKING",
  "DEPLOYING",
  "RETRYING",
  "LIVE",
  "STOPPED",
  "STOPPING",
  "STARTING",
]

export type CreateResult =
  | { ok: true; deploymentId: string }
  | { ok: false; error: string }

export type StagingAwsCreateResult =
  | { ok: true; deploymentId: string; finalPlan: FinalStagingPlan & { stagingDeploymentId: string } }
  | { ok: false; error: string }

export async function countActiveAwsServers(userId: string): Promise<number> {
  return prisma.deployment.count({
    where: { userId, type: "AWS_SERVER", status: { notIn: FINISHED } },
  })
}

/**
 * Creates the deployment and queues one provisioning job.
 *
 * Refuses a second live deployment with the same server name for the same user.
 * That is the double-submit guard that matters: BullMQ deduplicates by job id,
 * which stops one job running twice but cannot stop two Deploy clicks from
 * creating two deployments, and two deployments would mean two EC2 instances.
 */
export async function createAwsServerDeployment(input: {
  userId: string
  config: AwsServerConfigInput
}): Promise<CreateResult> {
  const validated = validateAwsServerConfig(input.config)
  if (!validated.ok) return { ok: false, error: validated.error }

  const config = validated.config

  // Provisioning happens in the user's own account, so a verified connection is
  // a hard requirement rather than a nicety.
  const connection = await getAwsConnectionStatus(input.userId)
  if (!connection.connected) {
    return {
      ok: false,
      error:
        "Connect an AWS account before deploying. TisiOps builds this server in your account, not its own.",
    }
  }

  const duplicate = await prisma.deployment.findFirst({
    where: {
      userId: input.userId,
      type: "AWS_SERVER",
      appName: config.projectName,
      status: { in: UNFINISHED },
    },
    select: { id: true },
  })

  if (duplicate) {
    return {
      ok: false,
      error: `A server named ${config.projectName} already exists. Open it or choose a different name.`,
    }
  }

  const deployment = await prisma.deployment.create({
    data: {
      userId: input.userId,
      type: "AWS_SERVER",
      provider: "USER_AWS_ACCOUNT",
      appName: config.projectName,
      template: AWS_SERVER_TEMPLATE,
      status: "PENDING",
      // The user approved the plan to reach this call, and the plan states the
      // cost. Recorded here because a job cannot be queued without it.
      costApprovedAt: new Date(),
      statusDetail: "Queued. A TisiOps worker will pick this up shortly.",
    },
  })

  await appendLog(deployment.id, "AWS server plan approved", "SUCCESS")
  await appendLog(deployment.id, COST_WARNING, "WARNING")
  await appendLog(deployment.id, PUBLIC_SERVER_WARNING, "WARNING")

  const queued = await createAndQueueJob({
    deploymentId: deployment.id,
    type: "AWS_APP_DEPLOYMENT",
    // Config only. Credentials are read from the user's saved connection at run
    // time so they never enter Postgres' job payload or the Redis message.
    payload: { ...config },
  })

  await appendLog(
    deployment.id,
    "Deployment job created",
    "INFO",
    null,
    queued.job.id
  )

  if (!queued.ok) {
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

  await prisma.deployment.update({
    where: { id: deployment.id },
    data: { status: "QUEUED", statusDetail: "Waiting for a TisiOps worker." },
  })

  return { ok: true, deploymentId: deployment.id }
}

function isFinalStagingPlan(value: unknown): value is FinalStagingPlan {
  const plan = value as Partial<FinalStagingPlan> | null
  return Boolean(
    plan &&
      plan.target === "NEW_SERVER" &&
      plan.provider === "AWS" &&
      typeof plan.region === "string" &&
      typeof plan.instanceType === "string" &&
      typeof plan.diskGb === "number" &&
      typeof plan.appPort === "number" &&
      Array.isArray(plan.requiredEnvVars)
  )
}

function stagingServerName(plan: FinalStagingPlan, stagingSessionId: string): string {
  const base = plan.repository ? `${plan.repository}-staging` : "staging-server"
  return `${base}-${stagingSessionId.slice(-6)}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
}

export async function createStagingAwsDeployment(input: {
  userId: string
  sourceServerId: string | null
  stagingSessionId: string
  finalPlan: unknown
}): Promise<StagingAwsCreateResult> {
  const session = await prisma.stagingSession.findFirst({
    where: {
      id: input.stagingSessionId,
      userId: input.userId,
      ...(input.sourceServerId ? { sourceServerId: input.sourceServerId } : {}),
    },
    select: { id: true },
  })
  if (!session) return { ok: false, error: "Staging plan not found." }

  if (input.sourceServerId) {
    const source = await prisma.server.findFirst({
      where: { id: input.sourceServerId, userId: input.userId },
      select: { id: true },
    })
    if (!source) return { ok: false, error: "Source server not found." }
  }

  if (!isFinalStagingPlan(input.finalPlan)) {
    return { ok: false, error: "Only NEW_SERVER/AWS staging plans can be executed." }
  }

  const existingId = (input.finalPlan as FinalStagingPlan & { stagingDeploymentId?: string })
    .stagingDeploymentId
  if (existingId) {
    const existing = await prisma.deployment.findFirst({
      where: { id: existingId, userId: input.userId, type: "AWS_SERVER" },
      select: { id: true },
    })
    if (existing) {
      return {
        ok: true,
        deploymentId: existing.id,
        finalPlan: { ...input.finalPlan, stagingDeploymentId: existing.id },
      }
    }
  }

  const payload = stagingPayloadFromPlan(input.stagingSessionId, input.finalPlan)
  if (!payload) {
    return { ok: false, error: "STAGING_REPOSITORY_REQUIRED" }
  }

  const missingSecrets = missingUserSecrets(payload.requiredEnvVars)
  if (missingSecrets.length > 0) {
    return {
      ok: false,
      error: `AWAITING_SECRETS: ${missingSecrets.join(", ")}`,
    }
  }

  const connection = await getAwsConnectionStatus(input.userId)
  if (!connection.connected) {
    return {
      ok: false,
      error:
        "Connect an AWS account before creating staging. TisiOps builds this server in your account, not its own.",
    }
  }

  const config: AwsServerConfig = {
    projectName: stagingServerName(input.finalPlan, input.stagingSessionId),
    region: input.finalPlan.region,
    instanceType: input.finalPlan.instanceType,
    volumeSizeGb: input.finalPlan.diskGb,
  }

  const duplicate = await prisma.deployment.findFirst({
    where: {
      userId: input.userId,
      type: "AWS_SERVER",
      appName: config.projectName,
      status: { in: UNFINISHED },
    },
    select: { id: true },
  })
  if (duplicate) {
    return {
      ok: true,
      deploymentId: duplicate.id,
      finalPlan: { ...input.finalPlan, stagingDeploymentId: duplicate.id },
    }
  }

  const deployment = await prisma.deployment.create({
    data: {
      userId: input.userId,
      type: "AWS_SERVER",
      provider: "USER_AWS_ACCOUNT",
      appName: config.projectName,
      repositoryName: input.finalPlan.repository ?? "",
      repositoryOwner: input.finalPlan.owner ?? "",
      repositoryUrl: payload.repositoryUrl,
      branch: input.finalPlan.stagingBranch,
      framework: input.finalPlan.runtime,
      template: AWS_SERVER_TEMPLATE,
      status: "PENDING",
      costApprovedAt: new Date(),
      statusDetail: "Queued. A TisiOps worker will create staging.",
    },
  })

  const finalPlan = { ...input.finalPlan, stagingDeploymentId: deployment.id }

  await prisma.stagingSession.update({
    where: { id: input.stagingSessionId },
    data: {
      approvedAt: new Date(),
      finalPlanJson: finalPlan as never,
    },
  })

  await appendLog(deployment.id, "Staging plan approved", "SUCCESS")
  await appendLog(deployment.id, COST_WARNING, "WARNING")
  await appendLog(
    deployment.id,
    "Staging will be exposed on HTTP at the Elastic IP. No DNS or TLS is configured.",
    "WARNING"
  )

  const queued = await createAndQueueJob({
    deploymentId: deployment.id,
    type: "AWS_APP_DEPLOYMENT",
    payload: {
      ...config,
      staging: payload,
    },
  })

  await appendLog(
    deployment.id,
    "Deployment job created",
    "INFO",
    null,
    queued.job.id
  )

  if (!queued.ok) {
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

  await prisma.deployment.update({
    where: { id: deployment.id },
    data: { status: "QUEUED", statusDetail: "Waiting for a TisiOps worker." },
  })

  return { ok: true, deploymentId: deployment.id, finalPlan }
}

export async function getAwsServerProgress(
  userId: string,
  deploymentId: string
): Promise<N8nProgress | null> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, userId, type: "AWS_SERVER" },
  })

  if (!deployment) return null

  const server = await prisma.server.findFirst({
    where: { deploymentId: deployment.id },
    orderBy: { createdAt: "desc" },
  })

  return buildProgress(
    deployment,
    server?.elasticIp ?? null,
    server?.status ?? null,
    AWS_SERVER_STEPS
  )
}

/**
 * The config this deployment was created with, read back from its first job.
 *
 * Used by retry so a re-run cannot land on different infrastructure than the
 * plan the user approved.
 */
export async function awsServerConfigFor(
  deploymentId: string
): Promise<AwsServerConfig | null> {
  const job = await prisma.deploymentJob.findFirst({
    where: { deploymentId, type: "AWS_APP_DEPLOYMENT" },
    orderBy: { createdAt: "asc" },
    select: { payloadJson: true },
  })

  if (!job) return null

  const validated = validateAwsServerConfig(
    (job.payloadJson ?? {}) as AwsServerConfigInput
  )
  return validated.ok ? validated.config : null
}

/**
 * Re-runs provisioning for a deployment that failed partway.
 *
 * Terraform reconciles against the state already written, so this finishes a
 * half-built server instead of creating a second one. The active-job guard is
 * what keeps two retries from running at once.
 */
export async function retryAwsServerDeployment(input: {
  userId: string
  deploymentId: string
}): Promise<CreateResult> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: input.deploymentId, userId: input.userId, type: "AWS_SERVER" },
    select: { id: true },
  })

  if (!deployment) return { ok: false, error: "Deployment not found" }

  if (await hasActiveJob(deployment.id)) {
    return { ok: false, error: "This deployment is already running." }
  }

  const config = await awsServerConfigFor(deployment.id)
  if (!config) {
    return {
      ok: false,
      error: "The original plan for this deployment could not be read.",
    }
  }

  const queued = await createAndQueueJob({
    deploymentId: deployment.id,
    type: "AWS_APP_DEPLOYMENT",
    payload: { ...config },
  })

  if (!queued.ok) return { ok: false, error: QUEUE_UNAVAILABLE }

  await prisma.deployment.update({
    where: { id: deployment.id },
    data: {
      status: "QUEUED",
      statusDetail: "Retry queued. Existing infrastructure is reused.",
      failureCode: null,
    },
  })

  return { ok: true, deploymentId: deployment.id }
}
