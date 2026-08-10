import type { Deployment } from "../../db/generated/client"

/**
 * Which lifecycle actions apply to a deployment.
 *
 * Pure: no database, no provider, no environment. Kept apart from
 * lifecycle.service.ts so the rules that decide whether something can be
 * stopped or deleted are checkable on their own — a mistake here either hides
 * a button or offers to delete something mid-build.
 */

export type Action = "stop" | "start" | "delete" | "remove"

export type ActionAvailability = {
  canStop: boolean
  canStart: boolean
  /** Removes the real thing: the AWS server or the Vercel project. */
  canDelete: boolean
  /** Removes the TisiOps record only, once nothing is left running. */
  canRemove: boolean
  /** Why an unavailable action is unavailable, for the UI to explain. */
  note: string | null
}

const STOPPABLE = [
  "LIVE",
  "ACCESS_BLOCKED",
  "HEALTH_CHECKING",
  "WAITING_FOR_DNS",
]
const BUSY = [
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
  "STOPPING",
  "STARTING",
]

/**
 * Which actions make sense right now.
 *
 * Stop and start only exist for a managed server: a Vercel deployment has no
 * machine to power off, and offering a button that cannot work is worse than
 * not offering one.
 */
export function availableActions(
  deployment: Deployment,
  hasServer: boolean,
  /**
   * From the job table, which is the truth about work in flight. The
   * deployment's status is not: a worker killed mid-run leaves it reading
   * HEALTH_CHECKING forever, and blocking on that would make a stalled
   * deployment impossible to delete while its server keeps billing.
   */
  hasRunningJob = false
): ActionAvailability {
  const settling = BUSY.includes(deployment.status)
  const managed = deployment.type !== "VERCEL" && hasServer

  if (hasRunningJob) {
    return {
      canStop: false,
      canStart: false,
      canDelete: false,
      canRemove: false,
      note: "Something is already running for this deployment.",
    }
  }

  return {
    // Power actions still need a settled state: stopping mid-build leaves a
    // half-configured server.
    canStop: managed && !settling && STOPPABLE.includes(deployment.status),
    canStart: managed && deployment.status === "STOPPED",
    // Deliberately allowed from a stalled state: whatever exists in AWS is
    // billing, so the user must always be able to remove it.
    canDelete:
      deployment.type === "VERCEL"
        ? Boolean(deployment.vercelProjectId)
        : hasServer,
    // Only once nothing real is left, so a record can never be deleted while
    // the thing it tracks is still running and billing.
    canRemove:
      deployment.status === "CANCELLED" ||
      deployment.status === "FAILED" ||
      deployment.status === "PLACEHOLDER",
    note: settling
      ? "This deployment stalled part-way. You can still delete its infrastructure."
      : deployment.type === "VERCEL" && !hasServer
        ? "Vercel deployments have no server to stop or start."
        : null,
  }
}
