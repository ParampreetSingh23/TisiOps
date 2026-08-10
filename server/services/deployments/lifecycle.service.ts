export * from "./lifecycle.rules"
import type { Deployment, JobType } from "../../db/generated/client"
import { prisma } from "../../db/prisma"
import {
  availableActions,
  type Action,
  type ActionAvailability,
} from "./lifecycle.rules"
import {
  createAndQueueJob,
  hasActiveJob,
  QUEUE_UNAVAILABLE,
} from "../deployment-job.service"
import { logToDeployment } from "../deployment-log.service"

/**
 * Stop, start, delete, and remove — for every deployment type.
 *
 * One place, because the rules are the same whatever is underneath: the caller
 * must own it, a destructive action needs a typed confirmation, and nothing
 * runs while another job is in flight. What differs is only which job type gets
 * queued, which is decided from the deployment's own record.
 */

export type ActionResult =
  { ok: true; queued: boolean } | { ok: false; status: number; error: string }

/** The job type for an action, decided from the deployment, never the request. */
function jobTypeFor(deployment: Deployment, action: Action): JobType | null {
  if (action === "stop") return "SERVER_STOP"
  if (action === "start") return "SERVER_START"
  if (action === "delete") {
    return deployment.type === "VERCEL" ? "VERCEL_DELETE" : "TERRAFORM_DESTROY"
  }

  return null
}

/**
 * Runs a lifecycle action.
 *
 * Ownership is enforced by the lookup, so a deployment belonging to someone
 * else answers 404 — the same as one that never existed.
 */
export async function runAction(input: {
  userId: string
  deploymentId: string
  action: Action
  /** Required for `delete` and `remove`; must be exactly DELETE. */
  confirm?: string
}): Promise<ActionResult> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: input.deploymentId, userId: input.userId },
  })

  if (!deployment) {
    return { ok: false, status: 404, error: "Deployment not found" }
  }

  const server = await prisma.server.findFirst({
    where: { deploymentId: deployment.id },
  })

  const running = await hasActiveJob(deployment.id)
  const actions = availableActions(
    deployment,
    Boolean(server?.awsInstanceId),
    running
  )
  const destructive = input.action === "delete" || input.action === "remove"

  if (destructive && input.confirm !== "DELETE") {
    return {
      ok: false,
      status: 422,
      error: "Type DELETE to confirm.",
    }
  }

  if (running) {
    return {
      ok: false,
      status: 409,
      error: "Something is already running for this deployment.",
    }
  }

  if (input.action === "stop" && !actions.canStop) {
    return {
      ok: false,
      status: 409,
      error: "This deployment cannot be stopped.",
    }
  }
  if (input.action === "start" && !actions.canStart) {
    return { ok: false, status: 409, error: "This deployment is not stopped." }
  }
  if (input.action === "delete" && !actions.canDelete) {
    return { ok: false, status: 409, error: "There is nothing to delete." }
  }

  // `remove` deletes the TisiOps record and nothing in a provider, so it runs
  // here rather than as a job. It is refused while anything is still live,
  // which is what stops a record vanishing while its server keeps billing.
  if (input.action === "remove") {
    if (!actions.canRemove) {
      return {
        ok: false,
        status: 409,
        error:
          "Delete the infrastructure first — removing the record now would leave it running with nothing tracking it.",
      }
    }

    await prisma.deployment.delete({ where: { id: deployment.id } })
    return { ok: true, queued: false }
  }

  const type = jobTypeFor(deployment, input.action)
  if (!type) {
    return { ok: false, status: 422, error: "Unknown action." }
  }

  // Recorded before the job exists, so the handler's own check has something
  // to verify — a queue message alone is never treated as consent.
  if (input.action === "delete") {
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: { destroyApprovedAt: new Date() },
    })
  }

  const queued = await createAndQueueJob({
    deploymentId: deployment.id,
    type,
    payload: {},
  })

  if (!queued.ok) {
    return { ok: false, status: 503, error: QUEUE_UNAVAILABLE }
  }

  // Power actions take effect on the screen now rather than when a worker picks
  // the job up. Without this a started server reads "Stopped" — with its start
  // button offered again — for as long as the queue takes, which is the one
  // moment the user is watching.
  if (input.action === "start" || input.action === "stop") {
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: input.action === "start" ? "STARTING" : "STOPPING",
        statusDetail:
          input.action === "start"
            ? "Starting the server."
            : "Stopping the server.",
      },
    })
  }

  await logToDeployment({
    deploymentId: deployment.id,
    jobId: queued.job.id,
    message: `${input.action} requested by user`,
    level: input.action === "delete" ? "WARNING" : "INFO",
  })

  return { ok: true, queued: true }
}

/** The action set for one deployment, for the UI. Scoped to its owner. */
export async function actionsFor(
  userId: string,
  deploymentId: string
): Promise<ActionAvailability | null> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, userId },
  })

  if (!deployment) return null

  const [server, running] = await Promise.all([
    prisma.server.findFirst({ where: { deploymentId } }),
    hasActiveJob(deploymentId),
  ])

  return availableActions(deployment, Boolean(server?.awsInstanceId), running)
}
