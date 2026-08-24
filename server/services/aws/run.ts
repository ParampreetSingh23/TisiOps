/**
 * Provisions one plain Ubuntu server in the user's own AWS account.
 *
 * The whole run is a straight line with no branching on AI output: validate the
 * config again, read the user's credentials, run the fixed Terraform module,
 * store what it produced, then confirm over SSH that the machine is real.
 *
 * Everything here is safe to run twice. Terraform reconciles against the state
 * it already wrote and the Server row is upserted per deployment, so a retry
 * finishes a half-built server rather than creating a second one.
 */

import type { DeploymentJob, DeploymentStatus } from "../../db/generated/client"
import { prisma } from "../../db/prisma"
import { decryptSecret, encryptSecret } from "../../utils/crypto"
import {
  generateSshKeyPair,
  provisioningSshCidr,
  runOverSsh,
  waitForSsh,
  type SshTarget,
} from "../bootstrap/ssh"
import { appendLog } from "../deployments/index"
import {
  logDeploymentStep,
  recordDeploymentStep,
} from "../observability/deployment-spans"
import { readAwsCredentials } from "../provider-connections/index"
import { getOrCreateServerMonitoring } from "../servers/server-monitoring.service"
import {
  buildStagingDeployScript,
  missingUserSecrets,
  type StagingDeploymentPayload,
} from "../servers/staging-execution"
import {
  describeFailure,
  diagnoseTerraformFailure,
} from "../terraform/terraformDiagnostics"
import { findTemplate } from "../terraform/terraformTemplateRegistry"
import {
  apply,
  CROSS_ACCOUNT_STATE_WARNING,
  init,
  LOCAL_STATE_WARNING,
  plan as terraformPlan,
  prepareWorkspace,
  readOutputs,
  remoteStateConfigured,
} from "../terraform/terraformRunner.service"
import { validateTerraformVariables } from "../terraform/terraformVariableValidator"
import { buildCloudInit, parseSystemFacts, SYSTEM_FACTS } from "./bootstrap"
import {
  AWS_SERVER_TEMPLATE,
  validateAwsServerConfig,
  type AwsServerConfigInput,
} from "./plans"

export type RunOutcome = { ok: true } | { ok: false; error: string }

function stagingPayload(value: unknown): StagingDeploymentPayload | null {
  const payload = value as Partial<StagingDeploymentPayload> | null
  if (
    !payload ||
    typeof payload.stagingSessionId !== "string" ||
    typeof payload.repositoryUrl !== "string" ||
    typeof payload.stagingBranch !== "string" ||
    typeof payload.appPort !== "number" ||
    !Array.isArray(payload.requiredEnvVars) ||
    !Array.isArray(payload.services)
  ) {
    return null
  }

  return {
    stagingSessionId: payload.stagingSessionId,
    repositoryUrl: payload.repositoryUrl,
    stagingBranch: payload.stagingBranch,
    appPort: payload.appPort,
    servicePath: typeof payload.servicePath === "string" ? payload.servicePath : null,
    requiredEnvVars: payload.requiredEnvVars.filter((name): name is string => typeof name === "string"),
    services: payload.services.filter((name): name is string => typeof name === "string"),
  }
}

async function publicHttpReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    return response.ok
  } catch {
    return false
  }
}

async function setStatus(
  deploymentId: string,
  status: DeploymentStatus,
  detail?: string | null
): Promise<void> {
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { status, statusDetail: detail ?? null },
  })
}

function logger(deploymentId: string, jobId: string) {
  return (
    message: string,
    level: "INFO" | "WARNING" | "ERROR" | "SUCCESS" = "INFO"
  ) => appendLog(deploymentId, message, level, null, jobId)
}

/**
 * The provisioning key pair, reused across retries.
 *
 * Generated once and stored encrypted on the deployment, because a fresh key on
 * a retry would not match the key pair Terraform already registered and SSH
 * would fail on a server that is otherwise fine.
 */
async function sshKeyFor(deploymentId: string) {
  const row = await prisma.deployment.findUniqueOrThrow({
    where: { id: deploymentId },
    select: { sshPublicKey: true, encryptedSshPrivateKey: true },
  })

  if (row.sshPublicKey && row.encryptedSshPrivateKey) {
    try {
      return {
        publicKey: row.sshPublicKey,
        privateKey: decryptSecret(row.encryptedSshPrivateKey),
      }
    } catch {
      // Key rotated before the first success: Terraform registers the fresh one.
    }
  }

  const fresh = await generateSshKeyPair()
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      sshPublicKey: fresh.publicKey,
      encryptedSshPrivateKey: encryptSecret(fresh.privateKey),
    },
  })
  return fresh
}

export async function runAwsServerDeployment(
  job: DeploymentJob
): Promise<RunOutcome> {
  const deploymentId = job.deploymentId
  const log = logger(deploymentId, job.id)
  const validated = validateAwsServerConfig(
    job.payloadJson as AwsServerConfigInput
  )

  if (!validated.ok) {
    await log(`Deployment config rejected: ${validated.error}`, "ERROR")
    return { ok: false, error: validated.error }
  }

  const config = validated.config
  const staging = stagingPayload(
    (job.payloadJson as { staging?: unknown } | null)?.staging
  )
  const template = findTemplate(AWS_SERVER_TEMPLATE)
  if (!template) return { ok: false, error: "Deployment template not found." }

  const spanAttrs = {
    deploymentId,
    deploymentJobId: job.id,
    jobType: job.type,
    templateId: AWS_SERVER_TEMPLATE,
    provider: "USER_AWS_ACCOUNT",
  }

  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id: deploymentId },
    select: { userId: true, costApprovedAt: true },
  })

  // A job should never reach the worker without an approval recorded, but the
  // check is cheap and this is the last gate before real money is spent.
  if (!deployment.costApprovedAt) {
    const error = "This deployment has no recorded cost approval."
    await log(error, "ERROR")
    return { ok: false, error }
  }

  if (staging) {
    const missingSecrets = missingUserSecrets(staging.requiredEnvVars)
    if (missingSecrets.length > 0) {
      const error = `AWAITING_SECRETS: ${missingSecrets.join(", ")}`
      await log(error, "ERROR")
      await prisma.stagingSession.update({
        where: { id: staging.stagingSessionId },
        data: { status: "PLAN_READY" },
      }).catch(() => {})
      return { ok: false, error }
    }
  }

  const credentials = await readAwsCredentials(deployment.userId)
  if (!credentials) {
    const error =
      "Your AWS connection is missing or could not be read. Reconnect your AWS account and retry."
    await log(error, "ERROR")
    return { ok: false, error }
  }

  if (!remoteStateConfigured()) await log(LOCAL_STATE_WARNING, "WARNING")
  else await log(CROSS_ACCOUNT_STATE_WARNING, "WARNING")

  // SSH is opened to the worker's own address, or to the configured egress
  // range, rather than the internet — so the only machine that can reach port 22
  // is the one doing the provisioning.
  const sshCidr = await provisioningSshCidr()
  const tfVars = validateTerraformVariables({
    template: AWS_SERVER_TEMPLATE,
    deploymentId,
    projectName: config.projectName,
    region: config.region,
    instanceType: config.instanceType,
    volumeSize: config.volumeSizeGb,
    environment: "preview",
    allowedSshCidr: sshCidr,
  })

  if (!tfVars.ok) {
    await log(`Terraform variables rejected: ${tfVars.error}`, "ERROR")
    return { ok: false, error: tfVars.error }
  }

  for (const warning of tfVars.warnings) await log(warning, "WARNING")
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "aws.plan.loaded",
    status: "success",
    message: "AWS server plan loaded",
    attrs: spanAttrs,
  })
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "terraform.module.selected",
    status: "success",
    message: `Using fixed Terraform module: ${template.modulePath}`,
    attrs: spanAttrs,
  })

  await setStatus(
    deploymentId,
    "PROVISIONING_INFRA",
    "Creating the server in your AWS account."
  )

  const key = await sshKeyFor(deploymentId)
  const redact = [key.privateKey]

  const cwd = await prepareWorkspace({
    deploymentId,
    modulePath: template.modulePath,
    variables: tfVars.variables,
    cloudInit: buildCloudInit(),
    sshPublicKey: key.publicKey,
  })

  await log("Terraform init started")
  const initResult = await init(
    cwd,
    deploymentId,
    AWS_SERVER_TEMPLATE,
    undefined,
    credentials
  )
  if (!initResult.ok) {
    const diagnosis = diagnoseTerraformFailure(initResult.output)
    await log(`Terraform init failed: ${diagnosis.message}`, "ERROR")
    return { ok: false, error: describeFailure(diagnosis) }
  }

  const planResult = await terraformPlan(cwd, redact, undefined, credentials)
  if (!planResult.ok) {
    const diagnosis = diagnoseTerraformFailure(planResult.output)
    await log(`Terraform failed: ${diagnosis.message}`, "ERROR")
    return { ok: false, error: describeFailure(diagnosis) }
  }

  // Only the count line is stored. The full plan names variables.
  const summary =
    planResult.output
      .split("\n")
      .reverse()
      .find((line) => /Plan: \d+ to add/.test(line))
      ?.trim() ?? "Plan generated."

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { template: AWS_SERVER_TEMPLATE, planSummary: summary },
  })
  await log(`Terraform plan generated: ${summary}`, "SUCCESS")

  try {
    await recordDeploymentStep({
      step: "terraform.apply",
      deploymentId,
      jobId: job.id,
      attrs: spanAttrs,
      startedMessage: "Terraform apply started",
      successMessage: "Terraform apply completed",
      run: async () => {
        const result = await apply(
          cwd,
          redact,
          (line) => {
            if (
              /^(module\.|aws_)/.test(line) &&
              /(Creating|Creation complete)/.test(line)
            ) {
              void log(line)
            }
          },
          credentials
        )

        if (!result.ok) {
          throw new Error(
            describeFailure(diagnoseTerraformFailure(result.output))
          )
        }

        return result
      },
    })
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Terraform apply failed."
    await log(`Terraform failed: ${message}`, "ERROR")
    return { ok: false, error: message }
  }

  const outputs = await readOutputs(cwd, credentials)
  if (!outputs?.elasticIp) {
    await log("Terraform finished without an Elastic IP", "ERROR")
    return { ok: false, error: "Terraform produced no server address." }
  }

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { terraformOutputs: outputs as never },
  })

  // One Server row per deployment. Upserted rather than created so a retry
  // updates the row it already made instead of leaving a duplicate behind.
  const existingServer = await prisma.server.findFirst({
    where: { deploymentId },
  })
  const serverData = {
    name: config.projectName,
    region: outputs.region || config.region,
    instanceType: outputs.instanceType || config.instanceType,
    awsInstanceId: outputs.instanceId,
    awsSecurityGroupId: outputs.securityGroupId,
    elasticIp: outputs.elasticIp,
    publicIp: outputs.publicIp,
    sshUsername: outputs.sshUsername || "ubuntu",
    credentialsStored: true,
    status: "PROVISIONING" as const,
  }

  const savedServer = existingServer
    ? await prisma.server.update({
        where: { id: existingServer.id },
        data: serverData,
        select: { id: true },
      })
    : await prisma.server.create({
        data: {
          userId: deployment.userId,
          deploymentId,
          // Provisioned by TisiOps but living in the user's account, so power
          // control reads the user's credentials rather than the platform's.
          provider: "USER_AWS_ACCOUNT",
          ...serverData,
        },
        select: { id: true },
      })

  await prisma.serverCredential.upsert({
    where: { serverId: savedServer.id },
    create: {
      serverId: savedServer.id,
      userId: deployment.userId,
      authType: "key",
      encryptedPrivateKey: encryptSecret(key.privateKey),
      encryptedPassword: null,
      encryptedPassphrase: null,
    },
    update: {
      authType: "key",
      encryptedPrivateKey: encryptSecret(key.privateKey),
      encryptedPassword: null,
      encryptedPassphrase: null,
    },
  })

  await log(`Server address: ${outputs.elasticIp}`, "SUCCESS")

  await setStatus(
    deploymentId,
    "HEALTH_CHECKING",
    "Verifying the server accepts connections."
  )

  const ssh: SshTarget = {
    host: outputs.elasticIp,
    username: outputs.sshUsername || "ubuntu",
    privateKey: key.privateKey,
  }

  let reachable = false
  try {
    reachable = await recordDeploymentStep({
      step: "server.wait_for_ssh",
      deploymentId,
      jobId: job.id,
      attrs: spanAttrs,
      startedMessage: "Waiting for SSH",
      successMessage: "Server reachable",
      run: async () => {
        const ok = await waitForSsh(ssh, {
          onWait: async () => {
            await log("Server is not accepting connections yet; still waiting")
          },
        })
        if (!ok) {
          throw new Error("SSH_TIMEOUT: server did not become reachable over SSH")
        }
        return ok
      },
    })
  } catch {
    reachable = false
  }

  if (!reachable) {
    await prisma.server.update({
      where: { id: savedServer.id },
      data: { status: "UNREACHABLE" },
    })
    return {
      ok: false,
      error:
        "The server was created but did not accept a connection. Retry — the existing server is reused, not replaced.",
    }
  }

  // Read the machine's own facts rather than repeating what was requested, so
  // what the dashboard shows is what actually booted.
  const facts = await runOverSsh(ssh, SYSTEM_FACTS)
  await prisma.server.update({
    where: { id: savedServer.id },
    data: {
      ...(facts.ok ? parseSystemFacts(facts.output) : {}),
      status: "READY",
      lastCheckedAt: new Date(),
    },
  })

  // Best effort: a monitoring hiccup must never fail a server that is up. The
  // GET monitoring route recreates the row lazily.
  try {
    await getOrCreateServerMonitoring(deployment.userId, savedServer.id)
  } catch {
    // Lazy creation on the monitoring route covers it.
  }

  if (staging) {
    await setStatus(
      deploymentId,
      "DEPLOYING",
      "Deploying the staging branch on the new server."
    )
    await log("Deploying staging branch")

    const deploy = await runOverSsh(
      ssh,
      buildStagingDeployScript({ deploymentId, payload: staging }),
      30 * 60_000
    )

    if (!deploy.ok || !deploy.output.includes("STAGING_READY")) {
      const branchMissing = /Remote branch .* not found|couldn't find remote ref|not found/i.test(deploy.output)
      const unsupported = /UNSUPPORTED_STAGING_DEPLOYMENT/.test(deploy.output)
      const error = branchMissing
        ? "STAGING_BRANCH_REQUIRED"
        : unsupported
          ? "UNSUPPORTED_STAGING_DEPLOYMENT: Docker Compose file not found"
          : "Staging deployment failed."

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          statusDetail: error,
          failureCode: branchMissing
            ? "STAGING_BRANCH_REQUIRED"
            : unsupported
              ? "UNSUPPORTED_STAGING_DEPLOYMENT"
              : "STAGING_DEPLOYMENT_FAILED",
        },
      })
      await prisma.stagingSession.update({
        where: { id: staging.stagingSessionId },
        data: { status: "FAILED" },
      }).catch(() => {})
      await log(error, "ERROR")
      return { ok: false, error }
    }

    const publicUrl = `http://${outputs.elasticIp}`
    if (!(await publicHttpReady(publicUrl))) {
      const error = "PUBLIC_HTTP_ENDPOINT_FAILED"
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          statusDetail: error,
          failureCode: error,
        },
      })
      await prisma.stagingSession.update({
        where: { id: staging.stagingSessionId },
        data: { status: "FAILED" },
      }).catch(() => {})
      await log(`Public HTTP check failed: ${publicUrl}`, "ERROR")
      return { ok: false, error }
    }

    await log("Staging services verified", "SUCCESS")
  }

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      status: "LIVE",
      statusDetail: null,
      failureCode: null,
      publicUrl: staging ? `http://${outputs.elasticIp}` : null,
    },
  })

  if (staging) {
    await prisma.stagingSession.update({
      where: { id: staging.stagingSessionId },
      data: { status: "READY" },
    }).catch(() => {})
  }

  await log(staging ? `Staging ready: http://${outputs.elasticIp}` : "Server is ready", "SUCCESS")
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "aws.server.ready",
    status: "success",
    message: "AWS server ready",
    attrs: spanAttrs,
  })

  return { ok: true }
}
