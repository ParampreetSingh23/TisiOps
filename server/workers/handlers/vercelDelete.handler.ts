import { prisma } from "../../db/prisma"
import { deleteProject } from "../../services/vercel/client"
import type { Handler } from "./types"

/**
 * Removes the Vercel project behind a deployment.
 *
 * Deleting the project is what actually takes the site down — deleting only the
 * TisiOps row would leave it serving forever with nothing tracking it.
 *
 * Requires the same recorded confirmation as an infrastructure destroy: a job
 * row on its own is never treated as consent.
 */
export const vercelDeleteHandler: Handler = async ({ deploymentId, log }) => {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  })

  if (!deployment) return { ok: false, error: "Deployment not found." }

  if (!deployment.destroyApprovedAt) {
    await log("Delete refused: no confirmation recorded", "ERROR")
    return {
      ok: false,
      error: "This deployment has no delete confirmation recorded.",
    }
  }

  const project = deployment.vercelProjectId
  if (!project) {
    await log("No Vercel project was ever created for this deployment")
  } else {
    await log(`Deleting Vercel project ${project}`, "WARNING")
    const result = await deleteProject(project)

    if (!result.ok) {
      await log(`Could not delete the Vercel project: ${result.error}`, "ERROR")
      return { ok: false, error: result.error }
    }

    await log("Vercel project deleted", "SUCCESS")
  }

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      status: "CANCELLED",
      statusDetail: "Vercel project deleted.",
      publicUrl: null,
      previewUrl: null,
      vercelDeploymentUrl: null,
    },
  })

  return { ok: true }
}
