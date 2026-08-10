import { prisma } from "../../db/prisma"
import { n8nManagedDeploymentHandler } from "./n8nManagedDeployment.handler"
import type { Handler, HandlerResult } from "./types"

/**
 * Repair: a fixed set of approved actions on a deployment that already exists.
 *
 * The action name comes from the job payload and is matched against this map.
 * Nothing else runs — an unknown action is refused rather than interpreted,
 * which is what keeps "repair" from becoming a way to ask the worker to do
 * arbitrary things to a server.
 */

export type RepairAction = "HEALTH_CHECK" | "REAPPLY_INFRA"

/**
 * Actions that need a shell on the box — restarting a container, editing the
 * reverse proxy, opening a port — are absent deliberately. Port 22 is closed
 * on these servers and nothing holds a key, so there is no way to perform them
 * honestly. Re-applying the infrastructure and letting cloud-init run again is
 * the supported equivalent.
 */
const UNSUPPORTED =
  "That repair action needs shell access to the server, which TisiOps does not have. Re-apply the infrastructure instead."

/** One request, not a wait loop: this reports a fact rather than watching for one. */
async function checkHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/healthz`, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    })
    return response.ok
  } catch {
    return false
  }
}

export const repairDeploymentHandler: Handler = async (context) => {
  const { deploymentId, job, log } = context

  const payload = (job.payloadJson ?? {}) as { action?: string }
  const action = payload.action as RepairAction | undefined

  if (action !== "HEALTH_CHECK" && action !== "REAPPLY_INFRA") {
    await log(`Repair action refused: ${action ?? "none given"}`, "ERROR")
    return {
      ok: false,
      error: action ? UNSUPPORTED : "No repair action given.",
    }
  }

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { publicUrl: true, previewUrl: true },
  })

  if (!deployment) return { ok: false, error: "Deployment not found." }

  if (action === "HEALTH_CHECK") {
    const url = deployment.publicUrl ?? deployment.previewUrl

    if (!url) {
      return {
        ok: false,
        error: "This deployment has no address to check yet.",
      }
    }

    await log(`Health check started against ${url}`)
    const healthy = await checkHealth(url)

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: healthy
        ? { status: "LIVE", statusDetail: null }
        : {
            status: "FAILED",
            statusDetail: "The deployment did not answer its health check.",
          },
    })

    await log(
      healthy ? "Health check passed" : "Health check failed",
      healthy ? "SUCCESS" : "ERROR"
    )

    return healthy
      ? { ok: true }
      : { ok: false, error: "The deployment did not answer its health check." }
  }

  // Re-apply reconciles against the existing Terraform state, so a resource
  // that already exists is left alone and only the missing or drifted parts
  // are recreated.
  await log("Re-applying infrastructure from the existing Terraform state")
  const result: HandlerResult = await n8nManagedDeploymentHandler(context)

  return result
}
