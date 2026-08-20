import { lookup } from "node:dns/promises"

import type { DeploymentJob, DeploymentStatus } from "../../db/generated/client"
import { prisma } from "../../db/prisma"
import { decryptSecret, encryptSecret } from "../../utils/crypto"
import { appendLog } from "../deployments/index"
import {
  buildCloudInit,
  buildDockerInstall,
  buildFiles,
  buildStartStack,
  buildVerifyStack,
  buildWriteFiles,
  generateSecrets,
  publicUrlFor,
} from "../bootstrap/n8nBootstrap.service"
import {
  generateSshKeyPair,
  runOverSsh,
  waitForSsh,
  workerPublicIp,
  type SshTarget,
} from "../bootstrap/ssh"
import { validateN8nConfig, type N8nConfig } from "./plans"
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
import {
  describeFailure,
  diagnoseTerraformFailure,
} from "../terraform/terraformDiagnostics"
import { findTemplate } from "../terraform/terraformTemplateRegistry"
import { validateTerraformVariables } from "../terraform/terraformVariableValidator"
import {
  logDeploymentStep,
  recordDeploymentStep,
} from "../observability/deployment-spans"

/**
 * One managed-n8n run, start to finish. Called only by the worker.
 *
 * Every phase writes its status to the deployment row before doing the work,
 * so the progress screen shows what is happening rather than what already
 * happened. The run is idempotent: Terraform state decides what actually gets
 * created, so a retry re-applies rather than rebuilding.
 */

export type RunOutcome = { ok: true } | { ok: false; error: string }

const HEALTH_TIMEOUT_MS = 12 * 60_000
const DNS_TIMEOUT_MS = 20 * 60_000

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

/** Every worker log line is written through here, so none of them bypass it. */
function logger(deploymentId: string, jobId: string) {
  return (
    message: string,
    level: "INFO" | "WARNING" | "ERROR" | "SUCCESS" = "INFO"
  ) => appendLog(deploymentId, message, level, null, jobId)
}

/**
 * Reuses this deployment's secrets, or creates them on the first run.
 *
 * Regenerating them on a retry would orphan every credential already stored in
 * n8n's database, so an existing pair always wins.
 */
async function secretsFor(deploymentId: string) {
  const config = await prisma.n8nDeploymentConfig.findUnique({
    where: { deploymentId },
  })

  if (config?.encryptedEncryptionKey && config?.encryptedDbPassword) {
    try {
      return {
        encryptionKey: decryptSecret(config.encryptedEncryptionKey),
        dbPassword: decryptSecret(config.encryptedDbPassword),
      }
    } catch {
      // A rotated key makes the stored pair unusable. Nothing has been
      // deployed with them if the first run never finished, so a fresh pair is
      // the only way forward — and the failure itself is not logged, because
      // the payload is a secret either way.
    }
  }

  const fresh = generateSecrets()

  await prisma.n8nDeploymentConfig.update({
    where: { deploymentId },
    data: {
      encryptedEncryptionKey: encryptSecret(fresh.encryptionKey),
      encryptedDbPassword: encryptSecret(fresh.dbPassword),
    },
  })

  return fresh
}

/**
 * This deployment's provisioning key, reused across retries.
 *
 * A new key on retry would not match the key pair Terraform already registered
 * with the instance, so the worker would lock itself out of the server it
 * created.
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
      // A rotated encryption key makes the stored pair unusable. Falling
      // through mints a new one, which Terraform then re-registers.
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

/** Waits until the domain's A record resolves to the Elastic IP. */
async function waitForDns(
  domain: string,
  elasticIp: string,
  log: ReturnType<typeof logger>
): Promise<boolean> {
  const deadline = Date.now() + DNS_TIMEOUT_MS
  let announced = false

  while (Date.now() < deadline) {
    try {
      const records = await lookup(domain, { all: true, family: 4 })
      if (records.some((record) => record.address === elasticIp)) return true
    } catch {
      // NXDOMAIN until the user creates the record — expected, not an error.
    }

    if (!announced) {
      announced = true
      await log(
        `Create an A record pointing ${domain} to ${elasticIp}`,
        "WARNING"
      )
    }

    await new Promise((resolve) => setTimeout(resolve, 15_000))
  }

  return false
}

/**
 * Waits for n8n to answer.
 *
 * `/healthz` is n8n's own endpoint, so a 200 means the app booted and reached
 * its database — not merely that Caddy is up. This is the only thing that
 * justifies calling a deployment live.
 */
async function waitForHealth(
  baseUrl: string,
  log: ReturnType<typeof logger>
): Promise<boolean> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  let reported = ""

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`, {
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      })

      if (response.ok) return true

      if (reported !== String(response.status)) {
        reported = String(response.status)
        await log(`Server responded with ${response.status}; still waiting`)
      }
    } catch {
      if (reported !== "unreachable") {
        reported = "unreachable"
        await log("Server is not answering yet; still waiting")
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }

  return false
}

export async function runN8nDeployment(
  job: DeploymentJob
): Promise<RunOutcome> {
  const deploymentId = job.deploymentId
  const log = logger(deploymentId, job.id)

  // Re-validated here even though the API already did it: the job row is the
  // only thing the worker trusts, and it may have been written by an older
  // build with different rules.
  const validated = validateN8nConfig(job.payloadJson as unknown as N8nConfig)

  if (!validated.ok) {
    await log(`Deployment config rejected: ${validated.error}`, "ERROR")
    return { ok: false, error: validated.error }
  }

  const config = validated.config

  if (!awsConfigured()) {
    const error = "AWS credentials are not configured on the TisiOps worker."
    await log(error, "ERROR")
    return { ok: false, error }
  }

  if (!remoteStateConfigured()) await log(LOCAL_STATE_WARNING, "WARNING")

  // The template decides which fixed module runs. Nothing in the job payload
  // can name a module path, only a template the registry already knows.
  const TEMPLATE = "aws-n8n-server"
  const spanAttrs = {
    deploymentId,
    deploymentJobId: job.id,
    jobType: job.type,
    templateId: TEMPLATE,
    provider: "TISIOPS_MANAGED_AWS",
  }
  const template = findTemplate(TEMPLATE)
  if (!template) return { ok: false, error: "Deployment template not found." }

  const egressForRules = await workerPublicIp()

  const tfVars = validateTerraformVariables({
    template: TEMPLATE,
    deploymentId,
    projectName: config.workspaceName,
    region: config.region,
    instanceType: config.instanceType,
    volumeSize: config.rootVolumeGb,
    environment: "preview",
    allowedSshCidr: egressForRules ? `${egressForRules}/32` : "0.0.0.0/0",
  })

  if (!tfVars.ok) {
    await log(`Terraform variables rejected: ${tfVars.error}`, "ERROR")
    return { ok: false, error: tfVars.error }
  }

  await log(`Terraform Agent selected template: ${TEMPLATE}`)
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "n8n.plan.loaded",
    status: "success",
    message: "n8n deployment plan loaded",
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
  await log("Terraform variables generated")
  await log("Terraform variables validated", "SUCCESS")
  for (const warning of tfVars.warnings) await log(warning, "WARNING")

  await log("Worker picked job", "SUCCESS")
  await setStatus(deploymentId, "RUNNING", "A TisiOps worker is running this.")

  const secrets = await secretsFor(deploymentId)
  const key = await sshKeyFor(deploymentId)
  const redact = [secrets.encryptionKey, secrets.dbPassword, key.privateKey]

  // Scoped to this worker's own address rather than the world. Falls back to
  // open only when the address cannot be determined, and says so — an open
  // port 22 is a decision, not something to do quietly.
  if (!egressForRules) {
    await log(
      "SSH is open for provisioning. Restrict SSH access before production use.",
      "WARNING"
    )
  }

  await setStatus(
    deploymentId,
    "PROVISIONING_INFRA",
    "Creating AWS infrastructure with Terraform."
  )
  await log("Preparing Terraform variables")

  await log(`Using fixed Terraform module: ${TEMPLATE}`)

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

  // The summary line only — the full plan output can name variables, and it is
  // large enough to be worth keeping out of the row entirely.
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

  let applyResult
  try {
    applyResult = await recordDeploymentStep({
      step: "terraform.apply",
      deploymentId,
      jobId: job.id,
      attrs: spanAttrs,
      startedMessage: "Terraform apply started",
      successMessage: "Terraform apply completed",
      run: async () => {
        const result = await apply(cwd, redact, (line) => {
          // Only resource-level lines are kept. The rest is noise, and the full
          // output can still name variables.
          if (
            /^(module\.|aws_)/.test(line) &&
            /(Creating|Creation complete)/.test(line)
          ) {
            void log(line)
          }
        })

        if (!result.ok) {
          const diagnosis = diagnoseTerraformFailure(result.output)
          if (diagnosis.nextStep) await log(diagnosis.nextStep, "WARNING")
          throw new Error(describeFailure(diagnosis))
        }

        return result
      },
    })
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Terraform apply failed.",
    }
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

  await log("Terraform outputs saved", "SUCCESS")

  await log("Terraform outputs received", "SUCCESS")
  await log(`EC2 instance created: ${outputs.instanceId}`, "SUCCESS")
  await log(`Elastic IP attached: ${outputs.elasticIp}`, "SUCCESS")

  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id: deploymentId },
    select: { userId: true },
  })

  // One row per deployment: a retry updates the record rather than adding a
  // second server that does not exist.
  const existing = await prisma.server.findFirst({ where: { deploymentId } })
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

  if (existing) {
    await prisma.server.update({ where: { id: existing.id }, data: serverData })
  } else {
    await prisma.server.create({
      data: {
        ...serverData,
        userId: deployment.userId,
        deploymentId,
        provider: "TISIOPS_MANAGED_AWS",
      },
    })
  }

  await setStatus(
    deploymentId,
    "BOOTSTRAPPING_SERVER",
    "Installing Docker, Postgres, and n8n on the server."
  )
  await log("Server bootstrap started")

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
    await log("Server did not become reachable over SSH", "ERROR")
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

  /**
   * Runs one bootstrap step, logging it and stopping on failure.
   *
   * `quiet` is for the step that writes .env — its output would echo the
   * generated secrets. Every other step's output is safe and its last lines are
   * logged, because "it failed" without a reason is not a diagnosis.
   */
  const step = async (
    label: string,
    script: string,
    done: string,
    options: { timeoutMs?: number; quiet?: boolean } = {}
  ): Promise<string | null> => {
    await log(label)
    const result = await runOverSsh(ssh, script, options.timeoutMs)

    if (!result.ok) {
      await log(`${label} failed`, "ERROR")

      if (!options.quiet) {
        const tail = result.output
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(-6)

        for (const line of tail) await log(line.slice(0, 300), "ERROR")
      }

      return null
    }

    await log(done, "SUCCESS")
    return result.output
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
        const output = await step(
          "Installing Docker and the Compose plugin",
          buildDockerInstall(),
          "Docker installed",
          { timeoutMs: 12 * 60_000 }
        )
        if (!output) throw new Error("DOCKER_INSTALL_FAILED: Docker could not be installed")
        return output
      },
    })
  } catch {
    return { ok: false, error: "Docker could not be installed on the server." }
  }

  const files = buildFiles({
    deploymentId,
    config,
    secrets,
    elasticIp: outputs.elasticIp,
  })

  if (
    !(await step(
      "Creating the n8n folder and configuration",
      buildWriteFiles({ deploymentId, files }),
      "n8n environment, Compose file, and Caddyfile generated",
      // The .env contents would be echoed by `set -x`.
      { quiet: true }
    ))
  ) {
    return { ok: false, error: "The n8n configuration could not be written." }
  }
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "n8n.config.generated",
    status: "success",
    message: "n8n config generated",
    attrs: spanAttrs,
  })

  await setStatus(
    deploymentId,
    "CONFIGURING_N8N",
    "Starting Postgres, n8n, and Caddy."
  )

  try {
    await recordDeploymentStep({
      step: "docker.compose.started",
      deploymentId,
      jobId: job.id,
      attrs: spanAttrs,
      startedMessage: "Containers starting",
      successMessage: "Containers started",
      run: async () => {
        const output = await step(
          "Containers starting",
          buildStartStack(deploymentId),
          "Containers started",
          { timeoutMs: 15 * 60_000 }
        )
        if (!output) throw new Error("CONTAINER_START_FAILED: containers could not be started")
        return output
      },
    })
  } catch {
    return { ok: false, error: "The n8n containers could not be started." }
  }

  const verified = await runOverSsh(ssh, buildVerifyStack(deploymentId))

  if (!verified.output.includes("N8N_RUNNING")) {
    // The container states are safe to surface: no secret appears in them, and
    // they are the difference between "n8n exited" and "still pulling".
    const states = verified.output
      .split("\n")
      .filter((line) => /\b(running|exited|restarting|created)\b/.test(line))
      .slice(0, 6)
      .join("; ")

    await log(`n8n container did not start. ${states}`, "ERROR")

    return {
      ok: false,
      error:
        "n8n was installed but its container did not stay running. Retry, or choose a larger plan if the server ran out of memory.",
    }
  }

  await log("Postgres running", "SUCCESS")
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "postgres.container.started",
    status: "success",
    message: "Postgres container started",
    attrs: spanAttrs,
  })
  await log("n8n running", "SUCCESS")
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "n8n.container.started",
    status: "success",
    message: "n8n container started",
    attrs: spanAttrs,
  })
  await log("Caddy running", "SUCCESS")
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "caddy.container.started",
    status: "success",
    message: "Caddy container started",
    attrs: spanAttrs,
  })

  if (config.domainMode === "CUSTOM" && config.domain) {
    await setStatus(
      deploymentId,
      "WAITING_FOR_DNS",
      `Waiting for ${config.domain} to point at ${outputs.elasticIp}.`
    )

    const resolved = await waitForDns(config.domain, outputs.elasticIp, log)

    if (!resolved) {
      await setStatus(
        deploymentId,
        "WAITING_FOR_DNS",
        `Create an A record pointing ${config.domain} to ${outputs.elasticIp}, then retry.`
      )
      await log("DNS did not resolve to the server in time", "WARNING")
      return {
        ok: false,
        error: `${config.domain} does not point at ${outputs.elasticIp} yet.`,
      }
    }

    await log(
      `DNS resolved: ${config.domain} → ${outputs.elasticIp}`,
      "SUCCESS"
    )
    await setStatus(
      deploymentId,
      "CONFIGURING_SSL",
      "Caddy is requesting a certificate."
    )
  } else {
    await setStatus(
      deploymentId,
      "CONFIGURING_N8N",
      "Starting Postgres and n8n."
    )
  }

  const publicUrl = publicUrlFor(config, outputs.elasticIp)

  await setStatus(deploymentId, "HEALTH_CHECKING", "Running the health check.")
  try {
    await recordDeploymentStep({
      step: "healthcheck",
      deploymentId,
      jobId: job.id,
      attrs: spanAttrs,
      startedMessage: `Running health check against ${publicUrl}`,
      successMessage: "Health check passed",
      run: async () => {
        const ok = await waitForHealth(publicUrl, log)
        if (!ok) throw new Error("HEALTHCHECK_FAILED: health check did not pass in time")
        return ok
      },
    })
  } catch {
    return {
      ok: false,
      error:
        "The server was created but n8n did not answer in time. Retry to check again — the existing server is reused.",
    }
  }

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      status: "LIVE",
      publicUrl,
      domain: config.domain,
      statusDetail: null,
      failureCode: null,
    },
  })

  await log("n8n is live", "SUCCESS")
  await logDeploymentStep({
    deploymentId,
    jobId: job.id,
    step: "deployment.live",
    status: "success",
    message: "n8n is live",
    attrs: spanAttrs,
  })

  if (!config.domain) {
    await log(
      "No domain is configured, so n8n is served over plain HTTP. Webhooks need an HTTPS domain to be reliable.",
      "WARNING"
    )
  }

  return { ok: true }
}
