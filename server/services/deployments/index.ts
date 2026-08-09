import type {
  Deployment,
  DeploymentAttempt,
  DeploymentLog,
} from "../../db/generated/client"
import { prisma } from "../../db/prisma"
import { decryptSecret } from "../../utils/crypto"
import { SOURCE_ERRORS, type SourceErrorCode } from "../github/source"

/**
 * Deployment persistence. Like the chat services, ownership is enforced by
 * the query: every function takes the database userId first and puts it in
 * the WHERE clause. A deployment belonging to someone else and one that does
 * not exist both come back null, so ids cannot be probed.
 */

export type SafeDeployment = {
  id: string
  type: Deployment["type"]
  provider: Deployment["provider"]
  appName: string
  repositoryName: string
  repositoryOwner: string
  repositoryUrl: string | null
  branch: string
  framework: string | null
  status: Deployment["status"]
  statusDetail: string | null
  failureCode: string | null
  /** True when the failure is fixed by reconnecting GitHub. */
  needsGithubReconnect: boolean
  previewUrl: string | null
  vercelProjectId: string | null
  vercelDeploymentId: string | null
  servicePath: string | null
  buildCommand: string | null
  startCommand: string | null
  retryCount: number
  lastRetriedAt: string | null
  /** Count only — values are never sent to the client. */
  environmentVariableCount: number
  /** True when the stored values can be decrypted and reused on a retry. */
  canReuseEnvironmentVariables: boolean
  canRetry: boolean
  createdAt: string
  updatedAt: string
}

export type SafeAttempt = {
  id: string
  attemptNumber: number
  status: DeploymentAttempt["status"]
  errorMessage: string | null
  previewUrl: string | null
  createdAt: string
  updatedAt: string
}

/** Statuses a user is allowed to run again. */
const RETRYABLE: Deployment["status"][] = ["FAILED", "CANCELLED", "PLACEHOLDER"]

export function canRetry(status: Deployment["status"]): boolean {
  return RETRYABLE.includes(status)
}

export function toSafeAttempt(row: DeploymentAttempt): SafeAttempt {
  return {
    id: row.id,
    attemptNumber: row.attemptNumber,
    status: row.status,
    errorMessage: row.errorMessage,
    previewUrl: row.previewUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export type SafeLog = {
  id: string
  level: DeploymentLog["level"]
  message: string
  /** Which run wrote this line, so retries can be grouped in the UI. */
  attemptId: string | null
  createdAt: string
}

export function toSafeDeployment(
  row: Deployment,
  environment?: { count: number; reusable: boolean }
): SafeDeployment {
  return {
    id: row.id,
    type: row.type,
    provider: row.provider,
    appName: row.appName,
    repositoryName: row.repositoryName,
    repositoryOwner: row.repositoryOwner,
    repositoryUrl: row.repositoryUrl,
    branch: row.branch,
    framework: row.framework,
    status: row.status,
    statusDetail: row.statusDetail,
    failureCode: row.failureCode,
    needsGithubReconnect: row.failureCode
      ? (SOURCE_ERRORS[row.failureCode as SourceErrorCode]?.reconnect ?? false)
      : false,
    previewUrl: row.previewUrl,
    vercelProjectId: row.vercelProjectId,
    vercelDeploymentId: row.vercelDeploymentId,
    servicePath: row.servicePath,
    buildCommand: row.buildCommand,
    startCommand: row.startCommand,
    retryCount: row.retryCount,
    lastRetriedAt: row.lastRetriedAt?.toISOString() ?? null,
    environmentVariableCount: environment?.count ?? 0,
    // Assumed reusable until a decryption check says otherwise; the detail
    // view runs that check, list views do not need it.
    canReuseEnvironmentVariables: environment?.reusable ?? true,
    canRetry: canRetry(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toSafeLog(row: DeploymentLog): SafeLog {
  return {
    id: row.id,
    level: row.level,
    message: row.message,
    attemptId: row.attemptId,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function createDeployment(input: {
  userId: string
  appName: string
  repositoryName: string
  repositoryOwner: string
  repositoryUrl: string | null
  branch: string
  framework: string | null
  servicePath?: string | null
  buildCommand?: string | null
  startCommand?: string | null
}) {
  return prisma.deployment.create({
    data: { ...input, status: "PREPARING" },
  })
}

/** Env var values are encrypted by the caller — this never sees plaintext. */
export async function saveEnvironmentVariables(
  deploymentId: string,
  variables: {
    key: string
    encryptedValue: string
    target: "PRODUCTION" | "PREVIEW" | "DEVELOPMENT"
  }[]
) {
  if (variables.length === 0) return
  await prisma.deploymentEnvVar.createMany({
    data: variables.map((variable) => ({ ...variable, deploymentId })),
    skipDuplicates: true,
  })
}

export async function appendLog(
  deploymentId: string,
  message: string,
  level: DeploymentLog["level"] = "INFO",
  attemptId?: string | null
) {
  return prisma.deploymentLog.create({
    data: { deploymentId, message, level, attemptId: attemptId ?? null },
  })
}

/** Writes several log lines in order, each with its own timestamp. */
export async function appendLogs(
  deploymentId: string,
  entries: { message: string; level?: DeploymentLog["level"] }[],
  attemptId?: string | null
) {
  for (const entry of entries) {
    await appendLog(
      deploymentId,
      entry.message,
      entry.level ?? "INFO",
      attemptId
    )
  }
}

/** Opens the next attempt for a deployment. Attempt 1 is the first deploy. */
export async function createAttempt(
  deploymentId: string
): Promise<DeploymentAttempt> {
  const previous = await prisma.deploymentAttempt.findFirst({
    where: { deploymentId },
    orderBy: { attemptNumber: "desc" },
    select: { attemptNumber: true },
  })

  return prisma.deploymentAttempt.create({
    data: {
      deploymentId,
      attemptNumber: (previous?.attemptNumber ?? 0) + 1,
      status: "PREPARING",
    },
  })
}

/** The run currently in progress, for reconciling a status after the fact. */
export async function latestAttempt(deploymentId: string) {
  return prisma.deploymentAttempt.findFirst({
    where: { deploymentId },
    orderBy: { attemptNumber: "desc" },
  })
}

export async function updateAttempt(
  attemptId: string,
  update: {
    status: DeploymentAttempt["status"]
    errorMessage?: string | null
    previewUrl?: string | null
  }
) {
  return prisma.deploymentAttempt.update({
    where: { id: attemptId },
    data: update,
  })
}

/** Attempts for one of this user's deployments, oldest first. */
export async function getAttempts(
  userId: string,
  deploymentId: string
): Promise<SafeAttempt[] | null> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, userId },
    select: { id: true },
  })
  if (!deployment) return null

  const attempts = await prisma.deploymentAttempt.findMany({
    where: { deploymentId },
    orderBy: { attemptNumber: "asc" },
  })

  return attempts.map(toSafeAttempt)
}

/**
 * Stored environment variables, decrypted for a retry.
 *
 * Server-side only: the plaintext is handed straight to the deployment call
 * and never returned through an API, rendered, or logged. `reusable` is false
 * when a row cannot be decrypted — a rotated key, for instance — so the UI
 * can ask the user to enter them again rather than silently deploying without.
 */
export async function readEnvironmentVariables(
  userId: string,
  deploymentId: string
): Promise<{
  variables: {
    key: string
    value: string
    target: "PRODUCTION" | "PREVIEW" | "DEVELOPMENT"
  }[]
  count: number
  reusable: boolean
}> {
  const rows = await prisma.deploymentEnvVar.findMany({
    where: { deploymentId, deployment: { userId } },
  })

  const variables: {
    key: string
    value: string
    target: "PRODUCTION" | "PREVIEW" | "DEVELOPMENT"
  }[] = []

  for (const row of rows) {
    try {
      variables.push({
        key: row.key,
        value: decryptSecret(row.encryptedValue),
        target: row.target,
      })
    } catch {
      // Never log the row: the failure says nothing useful and the payload
      // is a secret either way.
      return { variables: [], count: rows.length, reusable: false }
    }
  }

  return { variables, count: rows.length, reusable: true }
}

export async function updateDeploymentStatus(
  deploymentId: string,
  update: {
    status: Deployment["status"]
    failureCode?: string | null
    retryCount?: number
    lastRetriedAt?: Date
    previewUrl?: string | null
    vercelProjectId?: string | null
    vercelDeploymentId?: string | null
    statusDetail?: string | null
  }
) {
  return prisma.deployment.update({ where: { id: deploymentId }, data: update })
}

export async function listDeployments(
  userId: string
): Promise<SafeDeployment[]> {
  const rows = await prisma.deployment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  // One grouped count rather than a decrypt per deployment: the list only
  // needs how many variables exist, not whether they still decrypt.
  const counts = await prisma.deploymentEnvVar.groupBy({
    by: ["deploymentId"],
    where: { deploymentId: { in: rows.map((row) => row.id) } },
    _count: { _all: true },
  })
  const byDeployment = new Map(
    counts.map((entry) => [entry.deploymentId, entry._count._all])
  )

  return rows.map((row) =>
    toSafeDeployment(row, {
      count: byDeployment.get(row.id) ?? 0,
      reusable: true,
    })
  )
}

/**
 * The raw row for server-side work that needs fields the safe shape omits.
 * Still scoped by userId, so it cannot reach another user's deployment.
 */
export async function getDeploymentRow(userId: string, deploymentId: string) {
  return prisma.deployment.findFirst({ where: { id: deploymentId, userId } })
}

/** Null when the deployment is not this user's — same answer as "no such id". */
export async function getDeployment(
  userId: string,
  deploymentId: string
): Promise<SafeDeployment | null> {
  const row = await prisma.deployment.findFirst({
    where: { id: deploymentId, userId },
  })

  if (!row) return null

  // The detail view is where the retry button lives, so this is where the
  // "can the saved secrets actually be reused?" question gets answered.
  const environment = await readEnvironmentVariables(userId, row.id)

  return toSafeDeployment(row, {
    count: environment.count,
    reusable: environment.reusable,
  })
}

/** Null when the deployment is not this user's, so logs cannot leak by id. */
export async function getDeploymentLogs(
  userId: string,
  deploymentId: string
): Promise<SafeLog[] | null> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, userId },
    select: { id: true },
  })

  if (!deployment) return null

  const logs = await prisma.deploymentLog.findMany({
    where: { deploymentId: deployment.id },
    orderBy: { createdAt: "asc" },
  })

  return logs.map(toSafeLog)
}
