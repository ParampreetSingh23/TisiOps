import type { DeploymentStatus } from "../../db/generated/client"
import { prisma } from "../../db/prisma"
import { decryptSecret } from "../../utils/crypto"
import { appendLog } from "../deployments/index"
import {
  createAndQueueJob,
  hasActiveJob,
  QUEUE_UNAVAILABLE,
} from "../deployment-job.service"
import { maskDatabaseUrl } from "./bootstrap"
import {
  validatePostgresConfig,
  type PostgresConfigInput,
} from "./plans"

export const PUBLIC_PASSWORD_WARNING =
  "This PostgreSQL server is publicly reachable on port 5432 and protected by password only. Use this for MVP/testing only. For production, use IP allowlisting, private networking, VPN, or TLS."

const FINISHED: DeploymentStatus[] = ["FAILED", "CANCELLED"]

export async function countActivePostgres(userId: string): Promise<number> {
  return prisma.deployment.count({
    where: { userId, type: "POSTGRES", status: { notIn: FINISHED } },
  })
}

export type CreateResult =
  | { ok: true; deploymentId: string }
  | { ok: false; error: string }

export async function createManagedPostgresDeployment(input: {
  userId: string
  config: PostgresConfigInput
  targetServerId?: string | null
}): Promise<CreateResult> {
  const validated = validatePostgresConfig(input.config)
  if (!validated.ok) return { ok: false, error: validated.error }

  const config = validated.config
  const target = input.targetServerId
    ? await prisma.server.findFirst({
        where: { id: input.targetServerId, userId: input.userId },
        select: { id: true, status: true, credentialsStored: true },
      })
    : null
  if (input.targetServerId && (!target || target.status !== "CONNECTED" || !target.credentialsStored)) {
    return { ok: false, error: "Select a connected server with stored SSH credentials." }
  }

  const deployment = await prisma.deployment.create({
    data: {
      userId: input.userId,
      type: "POSTGRES",
      provider: target ? "BYOK_SERVER" : "TISIOPS_MANAGED_AWS",
      appName: config.workspaceName,
      template: "postgres-managed-server",
      status: "PENDING",
      costApprovedAt: new Date(),
      statusDetail: "Queued. A TisiOps worker will pick this up shortly.",
      postgresConfig: {
        create: {
          workspaceName: config.workspaceName,
          databaseName: config.databaseName,
          databaseUser: config.databaseUser,
          postgresVersion: config.postgresVersion,
          region: config.region,
          plan: config.plan,
          instanceType: config.instanceType,
          volumeSizeGb: config.volumeSizeGb,
        },
      },
    },
  })

  if (target) await prisma.server.update({ where: { id: target.id }, data: { deploymentId: deployment.id } })

  await appendLog(deployment.id, target ? "BYOK PostgreSQL deployment approved" : "PostgreSQL deployment approved", "SUCCESS")
  await appendLog(deployment.id, PUBLIC_PASSWORD_WARNING, "WARNING")

  const queued = await createAndQueueJob({
    deploymentId: deployment.id,
    type: "POSTGRES_MANAGED_SERVER_DEPLOYMENT",
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

export async function retryManagedPostgresDeployment(input: {
  userId: string
  deploymentId: string
}): Promise<CreateResult> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: input.deploymentId, userId: input.userId, type: "POSTGRES" },
    include: { postgresConfig: true },
  })

  if (!deployment?.postgresConfig) {
    return { ok: false, error: "Deployment not found" }
  }

  if (await hasActiveJob(deployment.id)) {
    return { ok: false, error: "This deployment is already running." }
  }

  const config = deployment.postgresConfig
  const queued = await createAndQueueJob({
    deploymentId: deployment.id,
    type: "POSTGRES_MANAGED_SERVER_DEPLOYMENT",
    payload: {
      workspaceName: config.workspaceName,
      databaseName: config.databaseName,
      databaseUser: config.databaseUser,
      postgresVersion: config.postgresVersion,
    },
  })

  if (!queued.ok) return { ok: false, error: QUEUE_UNAVAILABLE }

  await prisma.deployment.update({
    where: { id: deployment.id },
    data: { status: "QUEUED", statusDetail: "Retry queued." },
  })

  return { ok: true, deploymentId: deployment.id }
}

export async function getPostgresConnection(
  userId: string,
  deploymentId: string,
  reveal = false
) {
  const row = await prisma.postgresDeploymentConfig.findFirst({
    where: { deploymentId, deployment: { userId } },
  })

  if (!row) return null

  const host = row.host ?? "<server-ip>"
  const maskedDatabaseUrl = maskDatabaseUrl({
    user: row.databaseUser,
    host,
    port: row.port,
    database: row.databaseName,
  })

  return {
    type: "PostgreSQL Managed Server",
    access: "Public password-protected PostgreSQL",
    host: row.host,
    port: row.port,
    database: row.databaseName,
    user: row.databaseUser,
    persistence: true,
    maskedDatabaseUrl,
    databaseUrl:
      reveal && row.encryptedDatabaseUrl
        ? decryptSecret(row.encryptedDatabaseUrl)
        : null,
    password:
      reveal && row.encryptedPassword ? decryptSecret(row.encryptedPassword) : null,
    warning: PUBLIC_PASSWORD_WARNING,
  }
}
