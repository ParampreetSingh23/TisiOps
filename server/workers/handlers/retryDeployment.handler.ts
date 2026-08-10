import { prisma } from "../../db/prisma"
import { n8nManagedDeploymentHandler } from "./n8nManagedDeployment.handler"
import { vercelDeploymentHandler } from "./vercelDeployment.handler"
import type { Handler, HandlerResult } from "./types"

/**
 * Retry: the same run again, against the records that already exist.
 *
 * It deliberately delegates rather than reimplementing. A separate retry path
 * is how the first attempt and the retry drift apart, and for Terraform that
 * drift is what creates a second EC2 instance instead of re-applying over the
 * state already on disk.
 *
 * What makes this safe is that the handlers are idempotent by construction:
 * Terraform reconciles against its state file, and the Vercel run reuses the
 * project it created rather than making another.
 */
export const retryDeploymentHandler: Handler = async (context) => {
  const { deploymentId, log } = context

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { type: true, retryCount: true },
  })

  if (!deployment) return { ok: false, error: "Deployment not found." }

  await log(
    `Retry attempt #${deployment.retryCount + 1} started — reusing the saved configuration`
  )

  const result: HandlerResult =
    deployment.type === "N8N"
      ? await n8nManagedDeploymentHandler(context)
      : await vercelDeploymentHandler(context)

  await log(
    result.ok ? "Retry completed" : "Retry did not complete",
    result.ok ? "SUCCESS" : "WARNING"
  )

  return result
}
