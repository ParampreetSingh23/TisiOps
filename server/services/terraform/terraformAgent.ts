import { prisma } from "../../db/prisma"
import { diagnoseTerraformFailure } from "./terraformDiagnostics"
import { stateKey } from "./terraformTemplateRegistry"
import {
  remoteStateConfigured,
  workingDirectory,
} from "./terraformRunner.service"
import type { TerraformInspection } from "./terraformInspection"

export * from "./terraformAgentPlans"
export type { TerraformInspection } from "./terraformInspection"

/**
 * terraform_agent — the reasoning layer over Terraform deployments.
 *
 * It plans, explains, inspects, and diagnoses. It never runs Terraform and
 * never emits Terraform code: its only executable output is a set of variable
 * values, and those go through the validator before a worker uses them.
 *
 * Every function here takes the database userId first and scopes its query to
 * it, so a deployment belonging to someone else answers the same as one that
 * does not exist.
 */

/**
 * Everything the agent can read about one deployment.
 *
 * Assembled from Postgres, which is the source of truth. Nothing is read from
 * Redis, and nothing here triggers a Terraform command.
 */
/** Null when the deployment is not this user's — same answer as "no such id". */
export async function inspectDeployment(
  userId: string,
  deploymentId: string
): Promise<TerraformInspection | null> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, userId },
  })

  if (!deployment) return null

  const [server, lastJob] = await Promise.all([
    prisma.server.findFirst({
      where: { deploymentId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.deploymentJob.findFirst({
      where: { deploymentId },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const template = deployment.template
  const outputs = (deployment.terraformOutputs ?? null) as Record<
    string,
    unknown
  > | null

  // Diagnosed from the recorded reason rather than raw Terraform output, which
  // is never stored — the classifier runs on whichever text we do have.
  const failureText = lastJob?.errorMessage ?? deployment.statusDetail ?? ""
  const diagnosis =
    deployment.status === "FAILED" && failureText
      ? diagnoseTerraformFailure(failureText)
      : null

  return {
    deploymentId,
    template,
    region: server?.region ?? null,
    status: deployment.status,
    statusDetail: deployment.statusDetail,
    planSummary: deployment.planSummary,
    outputs,
    state: {
      key: template ? stateKey(template, deploymentId) : null,
      backend: remoteStateConfigured() ? "s3" : "local",
      hasRecordedOutputs: Boolean(outputs && Object.keys(outputs).length > 0),
      workingDirectory: template ? workingDirectory(deploymentId) : null,
    },
    server: server
      ? {
          instanceId: server.awsInstanceId,
          elasticIp: server.elasticIp,
          publicIp: server.publicIp,
          securityGroupId: server.awsSecurityGroupId,
          instanceType: server.instanceType,
          region: server.region,
          status: server.status,
        }
      : null,
    lastJob: lastJob
      ? {
          id: lastJob.id,
          type: lastJob.type,
          status: lastJob.status,
          attempts: lastJob.attempts,
          errorMessage: lastJob.errorMessage,
        }
      : null,
    diagnosis,
    canRetry:
      deployment.status === "FAILED" || deployment.status === "CANCELLED",
    canDestroy: Boolean(server?.awsInstanceId) || deployment.status === "LIVE",
  }
}
