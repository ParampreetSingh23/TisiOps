import { prisma } from "../../db/prisma"
import {
  buildCloudInit,
  generateSecrets,
} from "../../services/bootstrap/n8nBootstrap.service"
import { validateN8nConfig } from "../../services/n8n/plans"
import {
  diagnoseTerraformFailure,
  describeFailure,
} from "../../services/terraform/terraformDiagnostics"
import {
  destroy,
  init,
  prepareWorkspace,
} from "../../services/terraform/terraformRunner.service"
import { findTemplate } from "../../services/terraform/terraformTemplateRegistry"
import { validateTerraformVariables } from "../../services/terraform/terraformVariableValidator"
import type { Handler } from "./types"

/**
 * terraform destroy for one deployment.
 *
 * The only job that removes infrastructure. It refuses to run unless the
 * deployment carries a recorded destroy approval — the typed confirmation the
 * API demands — so a replayed or hand-crafted queue message cannot delete
 * someone's server.
 *
 * It destroys against this deployment's own state directory, so its blast
 * radius is exactly what this deployment created.
 */
export const terraformDestroyHandler: Handler = async ({
  deploymentId,
  log,
}) => {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { n8nConfig: true },
  })

  if (!deployment) return { ok: false, error: "Deployment not found." }

  // The second check, after the API's. A job row is not proof of consent.
  if (!deployment.destroyApprovedAt) {
    await log("Destroy refused: no confirmation recorded", "ERROR")
    return {
      ok: false,
      error: "This deployment has no destroy confirmation recorded.",
    }
  }

  if (!deployment.template) {
    return { ok: false, error: "This deployment has no Terraform template." }
  }

  const template = findTemplate(deployment.template)
  if (!template || template.cleanupStrategy !== "terraform-destroy") {
    return {
      ok: false,
      error: "This template cannot be destroyed automatically.",
    }
  }

  const config = deployment.n8nConfig
  if (!config) {
    return { ok: false, error: "This deployment has no saved configuration." }
  }

  const validatedConfig = validateN8nConfig({
    workspaceName: config.workspaceName,
    adminEmail: config.adminEmail,
    timezone: config.timezone,
    region: config.region,
    plan: config.plan,
    domainMode: config.domainMode,
    domain: config.domain,
  })

  if (!validatedConfig.ok) {
    return { ok: false, error: "Saved settings could not be read." }
  }

  const tfVars = validateTerraformVariables({
    template: deployment.template,
    deploymentId,
    projectName: config.workspaceName,
    region: config.region,
    instanceType: config.instanceType,
    volumeSize: validatedConfig.config.rootVolumeGb,
  })

  if (!tfVars.ok) return { ok: false, error: tfVars.error }

  await log(`Terraform Agent selected template: ${deployment.template}`)
  await log("Terraform destroy started", "WARNING")

  // The workspace is rebuilt from the same fixed module and variables so
  // Terraform sees the identical configuration it applied. cloud_init is
  // required by the module but never runs during a destroy.
  const cwd = await prepareWorkspace({
    deploymentId,
    modulePath: template.modulePath,
    variables: tfVars.variables,
    cloudInit: buildCloudInit(),
  })

  const initResult = await init(cwd, deploymentId, deployment.template)
  if (!initResult.ok) {
    return { ok: false, error: "Terraform could not initialise for destroy." }
  }

  const result = await destroy(cwd, [])

  if (!result.ok) {
    const diagnosis = diagnoseTerraformFailure(result.output)
    await log(`Terraform destroy failed: ${diagnosis.message}`, "ERROR")
    return { ok: false, error: describeFailure(diagnosis) }
  }

  await prisma.server.updateMany({
    where: { deploymentId },
    data: { status: "TERMINATED" },
  })

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      status: "CANCELLED",
      statusDetail: "Infrastructure destroyed.",
      publicUrl: null,
    },
  })

  await log("Terraform destroy completed — AWS resources removed", "SUCCESS")

  return { ok: true }
}
