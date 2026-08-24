import type { DeploymentJob, DeploymentStatus } from "../../db/generated/client"
import { prisma } from "../../db/prisma"
import { decryptSecret, encryptSecret } from "../../utils/crypto"
import { buildDockerInstall } from "../bootstrap/n8nBootstrap.service"
import {
  generateSshKeyPair,
  provisioningSshCidr,
  runOverSsh,
  waitForSsh,
  type SshTarget,
} from "../bootstrap/ssh"
import { appendLog } from "../deployments/index"
import {
  describeFailure,
  diagnoseTerraformFailure,
} from "../terraform/terraformDiagnostics"
import { findTemplate } from "../terraform/terraformTemplateRegistry"
import {
  apply,
  awsConfigured,
  init,
  LOCAL_STATE_WARNING,
  plan as terraformPlan,
  prepareWorkspace,
  readOutputs,
  remoteStateConfigured,
} from "../terraform/terraformRunner.service"
import { validateTerraformVariables } from "../terraform/terraformVariableValidator"
import {
  buildCloudInit,
  buildFiles,
  buildStartStack,
  buildVerifyStack,
  buildWriteFiles,
  databaseUrl,
  generatePostgresPassword,
  maskDatabaseUrl,
} from "./bootstrap"
import { PUBLIC_PASSWORD_WARNING } from "./index"
import { validatePostgresConfig, type PostgresConfig } from "./plans"
import {
  logDeploymentStep,
  recordDeploymentStep,
} from "../observability/deployment-spans"

export type RunOutcome = { ok: true } | { ok: false; error: string }

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

async function passwordFor(deploymentId: string): Promise<string> {
  const config = await prisma.postgresDeploymentConfig.findUnique({
    where: { deploymentId },
  })

  if (config?.encryptedPassword) {
    try {
      return decryptSecret(config.encryptedPassword)
    } catch {
      // Key rotation before first success: generate a fresh password.
    }
  }

  const password = generatePostgresPassword()
  await prisma.postgresDeploymentConfig.update({
    where: { deploymentId },
    data: { encryptedPassword: encryptSecret(password) },
  })
  return password
}

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
      // Terraform will register the fresh key below.
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

export async function runPostgresDeployment(
  job: DeploymentJob
): Promise<RunOutcome> {
  const deploymentId = job.deploymentId
  const log = logger(deploymentId, job.id)
  const validated = validatePostgresConfig(job.payloadJson as PostgresConfig)

  if (!validated.ok) {
    await log(`Deployment config rejected: ${validated.error}`, "ERROR")
    return { ok: false, error: validated.error }
  }

  const config = validated.config
  const TEMPLATE = "aws-postgres-server"
  const spanAttrs = {
    deploymentId,
    deploymentJobId: job.id,
    jobType: job.type,
    templateId: TEMPLATE,
    provider: "TISIOPS_MANAGED_AWS",
  }
  const template = findTemplate(TEMPLATE)

  if (!template) return { ok: false, error: "Deployment template not found." }

  if (!awsConfigured()) {
    const error = "AWS credentials are not configured on the TisiOps worker."
    await log(error, "ERROR")
    return { ok: false, error }
  }

  if (!remoteStateConfigured()) await log(LOCAL_STATE_WARNING, "WARNING")

  const egressForRules = await provisioningSshCidr()
  const tfVars = validateTerraformVariables({
    template: TEMPLATE,
    deploymentId,
    projectName: config.workspaceName,
    region: config.region,
    instanceType: config.instanceType,
    volumeSize: config.volumeSizeGb,
    environment: "preview",
    allowedSshCidr: egressForRules,
  })

  if (!tfVars.ok) {
    await log(`Terraform variables rejected: ${tfVars.error}`, "ERROR")
    return { ok: false, error: tfVars.error }
  }

  for (const warning of tfVars.warnings) await log(warning, "WARNING")
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "postgres.plan.loaded",
    status: "success",
    message: "PostgreSQL deployment plan loaded",
    attrs: spanAttrs,
  })
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "terraform.module.selected",
    status: "success",
    message: `Using fixed Terraform module: ${TEMPLATE}`,
    attrs: spanAttrs,
  })
  await log(PUBLIC_PASSWORD_WARNING, "WARNING")
  await setStatus(deploymentId, "PROVISIONING_INFRA", "Creating AWS infrastructure.")

  const password = await passwordFor(deploymentId)
  const key = await sshKeyFor(deploymentId)
  const redact = [password, key.privateKey]

  const cwd = await prepareWorkspace({
    deploymentId,
    modulePath: template.modulePath,
    variables: tfVars.variables,
    cloudInit: buildCloudInit(),
    sshPublicKey: key.publicKey,
  })

  await log("Terraform init started")
  const initResult = await init(cwd, deploymentId, TEMPLATE)
  if (!initResult.ok) {
    const diagnosis = diagnoseTerraformFailure(initResult.output)
    await log(`Terraform init failed: ${diagnosis.message}`, "ERROR")
    return { ok: false, error: describeFailure(diagnosis) }
  }

  const planResult = await terraformPlan(cwd, redact)
  if (!planResult.ok) {
    const diagnosis = diagnoseTerraformFailure(planResult.output)
    await log(`Terraform failed: ${diagnosis.message}`, "ERROR")
    return { ok: false, error: describeFailure(diagnosis) }
  }

  const summary =
    planResult.output
      .split("\n")
      .reverse()
      .find((line) => /Plan: \d+ to add/.test(line))
      ?.trim() ?? "Plan generated."

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { template: TEMPLATE, planSummary: summary },
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
        const result = await apply(cwd, redact, (line) => {
          if (/^(module\.|aws_)/.test(line) && /(Creating|Creation complete)/.test(line)) {
            void log(line)
          }
        })

        if (!result.ok) {
          const diagnosis = diagnoseTerraformFailure(result.output)
          throw new Error(describeFailure(diagnosis))
        }

        return result
      },
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Terraform apply failed."
    await log(`Terraform failed: ${message}`, "ERROR")
    return { ok: false, error: message }
  }

  const outputs = await readOutputs(cwd)
  if (!outputs?.elasticIp) {
    await log("Terraform finished without an Elastic IP", "ERROR")
    return { ok: false, error: "Terraform produced no server address." }
  }

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { terraformOutputs: outputs as never },
  })

  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id: deploymentId },
    select: { userId: true },
  })

  const existingServer = await prisma.server.findFirst({ where: { deploymentId } })
  const serverData = {
    region: outputs.region || config.region,
    instanceType: outputs.instanceType || config.instanceType,
    awsInstanceId: outputs.instanceId,
    awsSecurityGroupId: outputs.securityGroupId,
    elasticIp: outputs.elasticIp,
    publicIp: outputs.publicIp,
    sshUsername: outputs.sshUsername,
    status: "READY" as const,
  }

  const savedServer = existingServer
    ? await prisma.server.update({
        where: { id: existingServer.id },
        data: { ...serverData, credentialsStored: true },
        select: { id: true },
      })
    : await prisma.server.create({
        data: {
          userId: deployment.userId,
          deploymentId,
          provider: "TISIOPS_MANAGED_AWS",
          ...serverData,
          credentialsStored: true,
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

  const url = databaseUrl({
    user: config.databaseUser,
    password,
    host: outputs.elasticIp,
    port: 5432,
    database: config.databaseName,
  })
  const masked = maskDatabaseUrl({
    user: config.databaseUser,
    host: outputs.elasticIp,
    port: 5432,
    database: config.databaseName,
  })

  await prisma.postgresDeploymentConfig.update({
    where: { deploymentId },
    data: {
      host: outputs.elasticIp,
      encryptedDatabaseUrl: encryptSecret(url),
    },
  })

  await setStatus(deploymentId, "BOOTSTRAPPING_SERVER", "Installing Docker and PostgreSQL.")

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
        if (!ok) throw new Error("SSH_TIMEOUT: server did not become reachable over SSH")
        return ok
      },
    })
  } catch {
    reachable = false
  }

  if (!reachable) {
    return {
      ok: false,
      error:
        "The server was created but did not accept a provisioning connection. Retry — the existing server is reused.",
    }
  }
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "ssh.connected",
    status: "success",
    message: "SSH connected",
    attrs: spanAttrs,
  })

  const step = async (
    label: string,
    script: string,
    done: string,
    options: { timeoutMs?: number; quiet?: boolean } = {}
  ) => {
    await log(label)
    const result = await runOverSsh(ssh, script, options.timeoutMs)
    if (!result.ok) {
      await log(`${label} failed`, "ERROR")
      if (!options.quiet) {
        for (const line of result.output.split("\n").filter(Boolean).slice(-6)) {
          await log(line.slice(0, 300), "ERROR")
        }
      }
      return false
    }
    await log(done, "SUCCESS")
    return true
  }

  try {
    await recordDeploymentStep({
      step: "docker.install",
      deploymentId,
      jobId: job.id,
      attrs: spanAttrs,
      startedMessage: "Docker install started",
      successMessage: "Docker installed",
      run: async () => {
        const ok = await step("Installing Docker", buildDockerInstall(), "Docker installed", {
          timeoutMs: 12 * 60_000,
        })
        if (!ok) throw new Error("DOCKER_INSTALL_FAILED: Docker could not be installed")
        return ok
      },
    })
  } catch {
    return { ok: false, error: "Docker could not be installed on the server." }
  }

  const files = buildFiles({
    databaseName: config.databaseName,
    databaseUser: config.databaseUser,
    postgresVersion: config.postgresVersion,
    password,
    databaseUrl: url,
  })

  if (
    !(await step(
      "Creating PostgreSQL folder and configuration",
      buildWriteFiles({ deploymentId, files }),
      "PostgreSQL Compose file generated",
      { quiet: true }
    ))
  ) {
    return { ok: false, error: "The PostgreSQL configuration could not be written." }
  }
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "docker.compose.write",
    status: "success",
    message: "PostgreSQL Compose file generated",
    attrs: spanAttrs,
  })

  await setStatus(deploymentId, "DEPLOYING", "Starting PostgreSQL.")

  try {
    await recordDeploymentStep({
      step: "docker.compose.up",
      deploymentId,
      jobId: job.id,
      attrs: spanAttrs,
      startedMessage: "Starting PostgreSQL",
      successMessage: "PostgreSQL container started",
      run: async () => {
        const ok = await step("Starting PostgreSQL", buildStartStack(deploymentId), "PostgreSQL container started", {
          timeoutMs: 15 * 60_000,
        })
        if (!ok) throw new Error("CONTAINER_START_FAILED: PostgreSQL container could not be started")
        return ok
      },
    })
  } catch {
    return { ok: false, error: "The PostgreSQL container could not be started." }
  }
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "postgres.container.started",
    status: "success",
    message: "PostgreSQL container started",
    attrs: spanAttrs,
  })

  await setStatus(deploymentId, "HEALTH_CHECKING", "Running PostgreSQL health check.")
  try {
    await recordDeploymentStep({
      step: "postgres.healthcheck.pg_isready",
      deploymentId,
      jobId: job.id,
      attrs: spanAttrs,
      startedMessage: "Running PostgreSQL health check",
      successMessage: "PostgreSQL health check passed",
      run: async () => {
        const verified = await runOverSsh(ssh, buildVerifyStack(deploymentId))
        if (!verified.ok || !verified.output.includes("POSTGRES_READY")) {
          throw new Error("HEALTHCHECK_FAILED: PostgreSQL did not become ready in time")
        }
        return verified
      },
    })
  } catch {
    await log("PostgreSQL health check failed", "ERROR")
    return { ok: false, error: "PostgreSQL did not become ready in time." }
  }

  await log("PostgreSQL health check passed", "SUCCESS")
  await log(`Masked DATABASE_URL: ${masked}`, "SUCCESS")

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      status: "LIVE",
      statusDetail: null,
      failureCode: null,
      publicUrl: null,
    },
  })

  await log("PostgreSQL is live", "SUCCESS")
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "postgres.deployment.live",
    status: "success",
    message: "PostgreSQL is live",
    attrs: spanAttrs,
  })
  return { ok: true }
}
