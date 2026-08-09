import { encryptSecret } from "../../utils/crypto"
import {
  appendLog,
  canRetry,
  createAttempt,
  latestAttempt,
  createDeployment,
  appendLogs,
  getDeploymentRow,
  readEnvironmentVariables,
  updateAttempt,
  saveEnvironmentVariables,
  toSafeDeployment,
  updateDeploymentStatus,
  type SafeDeployment,
} from "../deployments/index"
import {
  listRepositories,
  mockRepositories,
  type RepositoryList,
} from "../github/repos"
import {
  getGithubStatus,
  type ClerkUsersApi,
  type GithubStatus,
} from "../github/status"
import {
  deployFromSource,
  isPreviewPublic,
  isVercelConfigured,
  LINKING_NOT_SUPPORTED,
  outputDirectoryFor,
  PROTECTED_PREVIEW_MESSAGE,
  waitForBuild,
} from "./client"
import { fetchRepositorySource, type SourceFailure } from "../github/source"

/**
 * vercel_deployment_agent — the single implementation behind both entry
 * points, the AI Console and the "Vercel Frontend" template. Neither has its
 * own flow logic; both call these functions.
 *
 * Scope: frontend apps to a TisiOps-managed Vercel account. The user never
 * supplies Vercel credentials.
 */

export const FEATURE_NAME = "TisiOps Managed Vercel Preview"
export const PLACEHOLDER_PREVIEW_URL = "https://tisiops-preview.vercel.app"

export const DEPLOYMENT_PLAN = [
  "Verify the selected repository belongs to your GitHub connection",
  "Read the repository source with your GitHub access, server-side",
  "Create the Vercel project under the TisiOps-managed account",
  "Configure framework settings",
  "Add environment variables securely",
  "Upload the source to Vercel — your repository is never linked to it",
  "Trigger the Vercel deployment",
  "Wait for the build result",
  "Save deployment status",
  "Return the Vercel preview URL",
  "Make the deployment visible in Deployments and Logs",
]

export type VercelFlowStart = {
  type: "vercel_deployment_flow"
  feature: typeof FEATURE_NAME
  title: typeof FEATURE_NAME
  description: string
  badge: "Managed Preview"
  note: string
  message: string
  nextStep: string
  github: GithubStatus
  repositories: RepositoryList
  plan: string[]
  /** False until VERCEL_TOKEN is configured; the UI must say so. */
  vercelConfigured: boolean
}

/**
 * Opening state for the guided flow: what GitHub says, which repositories are
 * selectable, and whether a real deployment is even possible.
 */
export async function startVercelFlow(
  clerkUserId: string,
  users: ClerkUsersApi
): Promise<VercelFlowStart> {
  const github = await getGithubStatus(clerkUserId, users)

  // Real repositories only when GitHub actually granted access; otherwise
  // clearly-labelled samples, never a silent mix of the two.
  const repositories =
    github.state === "repo_access_granted"
      ? await listRepositories(clerkUserId, users)
      : mockRepositories()

  const nextStep =
    github.state === "repo_access_granted"
      ? "Select a repository"
      : "Connect GitHub"

  return {
    type: "vercel_deployment_flow",
    feature: FEATURE_NAME,
    title: FEATURE_NAME,
    description:
      "Deploy a frontend application from GitHub to a Vercel preview URL managed by TisiOps.",
    badge: "Managed Preview",
    note: "No personal Vercel account is required for this MVP flow.",
    message:
      "Deploying a GitHub repository to a TisiOps-managed Vercel preview. Pick the repository and branch, add any environment variables, then approve the plan — nothing deploys before that.",
    nextStep,
    github,
    repositories,
    plan: DEPLOYMENT_PLAN,
    vercelConfigured: isVercelConfigured(),
  }
}

export type ApproveInput = {
  userId: string
  /** From the Clerk session — needed to read the repository as this user. */
  clerkUserId: string
  users: ClerkUsersApi
  appName: string
  repositoryName: string
  repositoryOwner: string
  repositoryUrl: string | null
  branch: string
  framework: string | null
  /** Monorepo folder to build, e.g. "frontend". Null deploys the root. */
  servicePath: string | null
  buildCommand: string | null
  environmentVariables: {
    key: string
    value: string
    target: "PRODUCTION" | "PREVIEW" | "DEVELOPMENT"
  }[]
}

/**
 * Records an honest placeholder: the approval, plan, and logs are kept, and
 * the deployment is never presented as a real build.
 */
async function placeholder(
  deploymentId: string,
  reason: string,
  extraLogs: string[] = [],
  attemptId?: string
): Promise<SafeDeployment> {
  await appendLogs(
    deploymentId,
    [
      { message: "MVP placeholder deployment created", level: "WARNING" },
      { message: reason, level: "WARNING" },
      ...extraLogs.map((message) => ({ message })),
    ],
    attemptId
  )

  if (attemptId) {
    await updateAttempt(attemptId, {
      status: "PLACEHOLDER",
      errorMessage: reason,
    })
  }

  const row = await updateDeploymentStatus(deploymentId, {
    status: "PLACEHOLDER",
    previewUrl: PLACEHOLDER_PREVIEW_URL,
    statusDetail: reason,
  })

  return toSafeDeployment(row)
}

/** Marks both the attempt and the deployment failed with one reason. */
async function fail(
  deploymentId: string,
  attemptId: string,
  reason: string,
  code?: string | null
): Promise<SafeDeployment> {
  await updateAttempt(attemptId, { status: "FAILED", errorMessage: reason })
  const failed = await updateDeploymentStatus(deploymentId, {
    status: "FAILED",
    statusDetail: reason,
    failureCode: code ?? null,
  })

  return toSafeDeployment(failed)
}

/**
 * One deploy or retry run, shared by the first deployment and every retry so
 * the two can never drift apart.
 *
 * Environment values arrive decrypted from the caller, are handed to Vercel,
 * and are never logged or returned.
 */
async function runAttempt(input: {
  deploymentId: string
  attemptId: string
  clerkUserId: string
  users: ClerkUsersApi
  repositoryOwner: string
  repositoryName: string
  branch: string
  framework: string | null
  buildCommand: string | null
  rootDirectory: string | null
  environmentVariables: {
    key: string
    value: string
    target: "PRODUCTION" | "PREVIEW" | "DEVELOPMENT"
  }[]
}): Promise<SafeDeployment> {
  const { deploymentId, attemptId } = input
  const outputDirectory = outputDirectoryFor(input.framework)

  await appendLogs(
    deploymentId,
    [
      {
        message: `Root directory selected: ${input.rootDirectory || "repository root"}`,
      },
      { message: `Framework detected: ${input.framework ?? "not detected"}` },
      {
        message: `Build command selected: ${input.buildCommand ?? "framework default"}`,
      },
      {
        message: `Output directory: ${outputDirectory ?? "default — managed by Vercel"}`,
      },
    ],
    attemptId
  )

  // Ownership is proven by the source step: it reads the repository with this
  // user's own GitHub token, so a forged repository name in the request body
  // simply fails to resolve. That check also reports *why*, which a separate
  // repo-list lookup could not.
  if (!isVercelConfigured()) {
    return placeholder(
      deploymentId,
      "MVP placeholder: real Vercel deployment execution is not enabled yet.",
      ["Real Vercel integration will be enabled later"],
      attemptId
    )
  }

  // Source is read with the user's own GitHub token and uploaded to Vercel.
  // Vercel is never asked to reach GitHub, which is what the old linking
  // approach required and could not have for a managed account.
  await updateDeploymentStatus(deploymentId, { status: "BUILDING" })

  const source = await fetchRepositorySource({
    clerkUserId: input.clerkUserId,
    users: input.users,
    owner: input.repositoryOwner,
    repo: input.repositoryName,
    ref: input.branch,
    rootDirectory: input.rootDirectory,
    onStep: async (message) => {
      await appendLog(deploymentId, message, "INFO", attemptId)
    },
  })

  if (!source.ok) {
    // Nothing goes to Vercel when the source was never prepared: no project,
    // no deployment, and no URL that would imply one exists.
    await appendLogs(
      deploymentId,
      [
        { message: "GitHub source download failed", level: "ERROR" },
        { message: `Reason: ${source.message}`, level: "ERROR" },
      ],
      attemptId
    )

    return fail(deploymentId, attemptId, source.message, source.code)
  }

  await appendLogs(
    deploymentId,
    [
      {
        message: `Deployment source prepared: ${source.files.length} files, ${Math.round(source.totalBytes / 1024)} KB`,
      },
      // Nothing is announced as started here: Vercel has not accepted the
      // request yet, and it can still reject it outright.
      { message: "Sending source to Vercel" },
    ],
    attemptId
  )

  const result = await deployFromSource({
    repositoryName: input.repositoryName,
    framework: input.framework,
    files: source.files,
    buildCommand: input.buildCommand,
    rootDirectory: input.rootDirectory,
    environmentVariables: input.environmentVariables,
  })

  if (!result.ok) {
    // A linking failure means the old architecture leaked back in; record it
    // as a placeholder with the developer-facing explanation rather than
    // repeating Vercel's un-actionable advice to the user.
    if (result.error === LINKING_NOT_SUPPORTED) {
      return placeholder(
        deploymentId,
        LINKING_NOT_SUPPORTED,
        ["Real source upload deployment is pending for this repository"],
        attemptId
      )
    }

    await appendLogs(
      deploymentId,
      [
        {
          message: `Vercel deployment failed: ${result.error}`,
          level: "ERROR",
        },
      ],
      attemptId
    )

    return fail(deploymentId, attemptId, result.error)
  }

  await appendLogs(
    deploymentId,
    [
      { message: "Vercel deployment created" },
      { message: "Preview URL reserved" },
      { message: "Waiting for Vercel build result" },
    ],
    attemptId
  )

  await updateDeploymentStatus(deploymentId, {
    status: "BUILDING",
    previewUrl: result.reservedUrl,
    vercelProjectId: result.projectId,
    vercelDeploymentId: result.deploymentId,
    statusDetail: "Vercel accepted the deployment. Waiting for the build.",
  })

  // A URL exists the moment Vercel accepts the request; only the build result
  // says whether anything is actually serving from it.
  const outcome = await waitForBuild(result.deploymentId, {
    onState: async (state) => {
      await appendLog(
        deploymentId,
        `Vercel status: ${state.toLowerCase()}`,
        "INFO",
        attemptId
      )
    },
  })

  if (outcome.state === "failed") {
    await appendLogs(
      deploymentId,
      [
        { message: "Vercel build failed", level: "ERROR" },
        { message: `Vercel error: ${outcome.error}`, level: "ERROR" },
      ],
      attemptId
    )
    return fail(deploymentId, attemptId, outcome.error)
  }

  if (outcome.state === "cancelled") {
    await appendLog(
      deploymentId,
      "Vercel build cancelled",
      "WARNING",
      attemptId
    )
    await updateAttempt(attemptId, { status: "CANCELLED" })
    const cancelled = await updateDeploymentStatus(deploymentId, {
      status: "CANCELLED",
      statusDetail: "The Vercel build was cancelled.",
    })
    return toSafeDeployment(cancelled)
  }

  if (outcome.state === "timeout") {
    await appendLog(
      deploymentId,
      `Still ${outcome.lastState.toLowerCase()} on Vercel after the wait window`,
      "WARNING",
      attemptId
    )
    const stillBuilding = await updateDeploymentStatus(deploymentId, {
      status: "BUILDING",
      statusDetail:
        "Vercel is still building. Refresh this page for the final result.",
    })
    return toSafeDeployment(stillBuilding)
  }

  return finishReadyDeployment({
    deploymentId,
    attemptId,
    url: outcome.url || result.reservedUrl,
    projectId: result.projectId,
    vercelDeploymentId: result.deploymentId,
  })
}

/**
 * A build Vercel calls ready still has to be reachable: Deployment Protection
 * turns a successful build into a preview nobody outside the team can open.
 */
async function finishReadyDeployment(input: {
  deploymentId: string
  attemptId: string | null
  url: string
  projectId: string | null
  vercelDeploymentId: string | null
}): Promise<SafeDeployment> {
  const { deploymentId, attemptId, url } = input

  await appendLogs(
    deploymentId,
    [
      { message: "Vercel deployment ready", level: "SUCCESS" },
      { message: "Preview accessibility check started" },
    ],
    attemptId
  )

  const isPublic = await isPreviewPublic(url)

  await appendLog(
    deploymentId,
    isPublic
      ? "Preview URL is public"
      : "Preview URL is protected by Vercel Deployment Protection",
    isPublic ? "SUCCESS" : "WARNING",
    attemptId
  )

  if (!isPublic) {
    if (attemptId) {
      await updateAttempt(attemptId, {
        status: "ACCESS_BLOCKED",
        previewUrl: url,
        errorMessage: PROTECTED_PREVIEW_MESSAGE,
      })
    }
    const blocked = await updateDeploymentStatus(deploymentId, {
      status: "ACCESS_BLOCKED",
      previewUrl: url,
      statusDetail: PROTECTED_PREVIEW_MESSAGE,
    })
    return toSafeDeployment(blocked)
  }

  await appendLog(deploymentId, "Preview URL is live", "SUCCESS", attemptId)
  if (attemptId) {
    await updateAttempt(attemptId, { status: "LIVE", previewUrl: url })
  }

  const live = await updateDeploymentStatus(deploymentId, {
    status: "LIVE",
    previewUrl: url,
    vercelProjectId: input.projectId,
    vercelDeploymentId: input.vercelDeploymentId,
    statusDetail: null,
    failureCode: null,
  })

  return toSafeDeployment(live)
}

/**
 * Records the approval, then deploys for real when the managed Vercel account
 * is configured. If it is not — or if Vercel refuses — the deployment is
 * stored as PLACEHOLDER with the reason. It is never reported as live unless
 * Vercel actually returned a deployment.
 */
export async function approveAndDeploy(
  input: ApproveInput
): Promise<SafeDeployment> {
  const deployment = await createDeployment({
    userId: input.userId,
    appName: input.appName,
    repositoryName: input.repositoryName,
    repositoryOwner: input.repositoryOwner,
    repositoryUrl: input.repositoryUrl,
    branch: input.branch,
    framework: input.framework,
    servicePath: input.servicePath,
    buildCommand: input.buildCommand,
  })

  // Values are encrypted before they touch the database and are never read
  // back out to the client.
  await saveEnvironmentVariables(
    deployment.id,
    input.environmentVariables.map((variable) => ({
      key: variable.key,
      encryptedValue: encryptSecret(variable.value),
      target: variable.target,
    }))
  )

  const attempt = await createAttempt(deployment.id)

  await appendLogs(
    deployment.id,
    [
      { message: "Vercel deployment request created" },
      {
        message: `GitHub repository selected: ${input.repositoryOwner}/${input.repositoryName} (${input.branch})`,
      },
      { message: "AI repo analysis completed" },
      {
        message: `Environment variables prepared: ${input.environmentVariables.length}`,
      },
      { message: "Deployment plan generated" },
      { message: "User approved deployment", level: "SUCCESS" },
    ],
    attempt.id
  )

  return runAttempt({
    deploymentId: deployment.id,
    attemptId: attempt.id,
    clerkUserId: input.clerkUserId,
    users: input.users,
    repositoryOwner: input.repositoryOwner,
    repositoryName: input.repositoryName,
    branch: input.branch,
    framework: input.framework,
    buildCommand: input.buildCommand,
    rootDirectory: input.servicePath,
    environmentVariables: input.environmentVariables,
  })
}

export type RetryResult =
  | { ok: true; deployment: SafeDeployment }
  | {
      ok: false
      reason: "not_found" | "not_retryable" | "env_unavailable"
      message: string
    }

/**
 * Retries a failed deployment with the configuration it already has.
 *
 * Ownership is enforced by the lookup: a deployment that is not this user's
 * and one that does not exist both return "not_found", so a pasted id reveals
 * nothing.
 *
 * Stored environment variables are decrypted here and passed straight to the
 * run — they are never returned to the caller, rendered, or logged. If they
 * cannot be decrypted the retry stops rather than silently deploying without
 * the values the build needs.
 */
export async function retryDeployment(input: {
  userId: string
  clerkUserId: string
  users: ClerkUsersApi
  deploymentId: string
}): Promise<RetryResult> {
  const existing = await getDeploymentRow(input.userId, input.deploymentId)
  if (!existing) {
    return {
      ok: false,
      reason: "not_found",
      message: "Deployment not found",
    }
  }

  if (!canRetry(existing.status)) {
    return {
      ok: false,
      reason: "not_retryable",
      message: `A ${existing.status.toLowerCase()} deployment cannot be retried.`,
    }
  }

  const environment = await readEnvironmentVariables(input.userId, existing.id)

  if (!environment.reusable) {
    return {
      ok: false,
      reason: "env_unavailable",
      message:
        "Environment variables need to be entered again because the saved values could not be read.",
    }
  }

  const attempt = await createAttempt(existing.id)

  await updateDeploymentStatus(existing.id, {
    status: "RETRYING",
    statusDetail: null,
    retryCount: existing.retryCount + 1,
    lastRetriedAt: new Date(),
  })

  await appendLogs(
    existing.id,
    [
      {
        message: `Previous attempt failed: ${existing.statusDetail ?? "no reason recorded"}`,
        level: "WARNING",
      },
      { message: "Retry requested by user" },
      { message: "Reusing deployment configuration" },
      {
        message: `Using corrected output directory for ${existing.framework ?? "this framework"}: ${outputDirectoryFor(existing.framework) ?? "default"}`,
      },
      {
        message: `Reusing saved environment variable keys: ${environment.count}`,
      },
      {
        message: `Retry attempt #${attempt.attemptNumber} started`,
        level: "SUCCESS",
      },
    ],
    attempt.id
  )

  // The same run as the first deployment: source is read with the user's
  // GitHub token and uploaded, never linked through Vercel's Git integration.
  const deployment = await runAttempt({
    deploymentId: existing.id,
    attemptId: attempt.id,
    clerkUserId: input.clerkUserId,
    users: input.users,
    repositoryOwner: existing.repositoryOwner,
    repositoryName: existing.repositoryName,
    branch: existing.branch,
    framework: existing.framework,
    buildCommand: existing.buildCommand,
    rootDirectory: existing.servicePath,
    environmentVariables: environment.variables,
  })

  return { ok: true, deployment }
}

/**
 * Brings a deployment's status up to date from Vercel.
 *
 * The in-request poll can be orphaned — a server restart, a deploy, a timeout
 * — which used to leave a record stuck at BUILDING forever even though the
 * build had finished. Reconciling on read means the truth arrives the next
 * time anyone opens the deployment, with no background worker to run.
 *
 * Scoped by userId, and a no-op unless the deployment is genuinely in flight.
 */
export async function reconcileDeployment(
  userId: string,
  deploymentId: string
): Promise<SafeDeployment | null> {
  const existing = await getDeploymentRow(userId, deploymentId)
  if (!existing) return null

  const inFlight =
    existing.status === "BUILDING" ||
    existing.status === "RETRYING" ||
    existing.status === "PREPARING"

  if (!inFlight || !existing.vercelDeploymentId || !isVercelConfigured()) {
    return toSafeDeployment(existing)
  }

  const attempt = await latestAttempt(existing.id)

  // One check, not a loop: this runs on a page load.
  const outcome = await waitForBuild(existing.vercelDeploymentId, {
    timeoutMs: 1,
    intervalMs: 1,
  })

  if (outcome.state === "timeout") return toSafeDeployment(existing)

  if (outcome.state === "failed") {
    await appendLogs(
      existing.id,
      [
        { message: "Vercel build failed", level: "ERROR" },
        { message: `Vercel error: ${outcome.error}`, level: "ERROR" },
      ],
      attempt?.id
    )
    if (attempt) {
      await updateAttempt(attempt.id, {
        status: "FAILED",
        errorMessage: outcome.error,
      })
    }
    const failed = await updateDeploymentStatus(existing.id, {
      status: "FAILED",
      statusDetail: outcome.error,
    })
    return toSafeDeployment(failed)
  }

  if (outcome.state === "cancelled") {
    await appendLog(
      existing.id,
      "Vercel build cancelled",
      "WARNING",
      attempt?.id
    )
    if (attempt) await updateAttempt(attempt.id, { status: "CANCELLED" })
    const cancelled = await updateDeploymentStatus(existing.id, {
      status: "CANCELLED",
      statusDetail: "The Vercel build was cancelled.",
    })
    return toSafeDeployment(cancelled)
  }

  return finishReadyDeployment({
    deploymentId: existing.id,
    attemptId: attempt?.id ?? null,
    url: outcome.url || existing.previewUrl || "",
    projectId: existing.vercelProjectId,
    vercelDeploymentId: existing.vercelDeploymentId,
  })
}
