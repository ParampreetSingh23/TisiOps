import type { TerraformVariables } from "./terraformVariableValidator"
import { spawn } from "node:child_process"
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Terraform runner. Only ever called from the worker — a `terraform apply`
 * takes minutes and would outlive any HTTP request.
 *
 * TisiOps never generates Terraform. It copies a fixed root module, writes a
 * .tfvars beside it, and runs the CLI. That is what keeps AI-suggested values
 * confined to variables the validator already approved.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TERRAFORM_ROOT = path.resolve(HERE, "../../infra/terraform")
const MODULES = path.join(TERRAFORM_ROOT, "modules")
const TEMPLATE = path.join(TERRAFORM_ROOT, "templates/root")

export const LOCAL_STATE_WARNING =
  "Local Terraform state is enabled for development only. Use S3 remote state before production."

export function workingDirectory(deploymentId: string): string {
  return path.join(TERRAFORM_ROOT, "deployments", deploymentId)
}

export function remoteStateConfigured(): boolean {
  return Boolean(process.env.TF_STATE_BUCKET)
}

export type RunResult = {
  ok: boolean
  /** Combined output, already scrubbed. Safe to store and show. */
  output: string
}

/**
 * Terraform prints variable values on error and echoes environment in debug
 * mode. Anything that could carry a secret is replaced before the text reaches
 * a log table or a browser.
 */
export function scrub(text: string, secrets: string[]): string {
  let safe = text

  for (const secret of secrets) {
    if (secret && secret.length > 6)
      safe = safe.split(secret).join("«redacted»")
  }

  return safe
    .replace(/(AWS_SECRET_ACCESS_KEY\s*[=:]\s*)\S+/gi, "$1«redacted»")
    .replace(/(AWS_ACCESS_KEY_ID\s*[=:]\s*)\S+/gi, "$1«redacted»")
    .replace(/(AKIA|ASIA)[A-Z0-9]{16}/g, "«redacted»")
    .replace(/(aws_session_token\s*[=:]\s*)\S+/gi, "$1«redacted»")
}

/**
 * Runs one Terraform command.
 *
 * AWS credentials are passed through the environment, which is where the CLI
 * expects them. `TF_IN_AUTOMATION` drops the "run terraform apply next"
 * suggestions, and `-no-color` keeps escape codes out of stored logs.
 */
async function run(
  args: string[],
  cwd: string,
  options: { secrets?: string[]; onLine?: (line: string) => void } = {}
): Promise<RunResult> {
  const secrets = options.secrets ?? []

  return new Promise((resolve) => {
    const child = spawn("terraform", [...args, "-no-color"], {
      cwd,
      env: {
        ...process.env,
        TF_IN_AUTOMATION: "1",
        TF_INPUT: "0",
      },
    })

    let output = ""

    const collect = (chunk: Buffer) => {
      const text = scrub(chunk.toString(), secrets)
      output += text
      for (const line of text.split("\n")) {
        if (line.trim()) options.onLine?.(line.trim())
      }
    }

    child.stdout.on("data", collect)
    child.stderr.on("data", collect)

    child.on("error", (error) => {
      resolve({
        ok: false,
        output: `terraform could not start: ${error.message}`,
      })
    })

    child.on("close", (code) => resolve({ ok: code === 0, output }))
  })
}

/**
 * Prepares the per-deployment directory.
 *
 * Copies the fixed root, points ./module at the template the registry named,
 * and writes the validated variables as JSON. TisiOps never generates
 * Terraform — only this variables file changes per deployment.
 *
 * Idempotent by design: a retry lands in the same directory and reuses the
 * state already there, which is what stops a second run creating a second EC2
 * instance.
 */
export async function prepareWorkspace(input: {
  deploymentId: string
  /** Directory name under infra/terraform/modules, from the registry. */
  modulePath: string
  variables: TerraformVariables
  cloudInit: string
  /** Registered as an AWS key pair so the worker can provision over SSH. */
  sshPublicKey?: string
}): Promise<string> {
  const cwd = workingDirectory(input.deploymentId)
  await mkdir(cwd, { recursive: true })
  await cp(TEMPLATE, cwd, { recursive: true, dereference: false })

  // The module is linked rather than copied so a fix to a shared module
  // reaches an in-flight retry, and so the working directory stays small.
  const link = path.join(cwd, "module")
  await rm(link, { force: true, recursive: true })
  await symlink(path.join(MODULES, input.modulePath), link, "dir")

  // Terraform reads *every* .tfvars file in the directory. A retry lands in a
  // directory an older build may have written, so the legacy HCL file is
  // removed explicitly — leaving it behind fails the plan with "Variables not
  // allowed", because a cloud-init script containing ${...} is valid shell but
  // an interpolation in HCL.
  await rm(path.join(cwd, "terraform.tfvars"), { force: true })

  // JSON rather than HCL: it cannot be mis-quoted, and a multi-line cloud-init
  // script with quotes in it survives without escaping rules.
  await writeFile(
    path.join(cwd, "terraform.tfvars.json"),
    JSON.stringify(
      {
        ...input.variables,
        cloud_init: input.cloudInit,
        ssh_public_key: input.sshPublicKey ?? "",
      },
      null,
      2
    ),
    { mode: 0o600 }
  )

  return cwd
}

/**
 * `terraform init`, pointed at S3 when a bucket is configured and at a local
 * file when it is not. The local path is development-only and the caller warns
 * about it, because state on the worker's disk is lost with the worker.
 */
export async function init(
  cwd: string,
  deploymentId: string,
  template: string,
  onLine?: (line: string) => void
): Promise<RunResult> {
  const bucket = process.env.TF_STATE_BUCKET

  if (!bucket) {
    // An empty `backend "s3"` block cannot fall back on its own, so the block
    // is removed for local runs and Terraform uses its default local backend.
    const mainPath = path.join(cwd, "versions.tf")
    const main = await readFile(mainPath, "utf8")
    await writeFile(mainPath, main.replace(/\n\s*backend "s3" \{\}\n/, "\n"))

    return run(["init", "-upgrade"], cwd, { onLine })
  }

  const backend = [
    `-backend-config=bucket=${bucket}`,
    `-backend-config=key=terraform/${template}/${deploymentId}/terraform.tfstate`,
    `-backend-config=region=${process.env.TF_STATE_REGION ?? process.env.AWS_REGION ?? "ap-south-1"}`,
  ]

  if (process.env.TF_STATE_LOCK_TABLE) {
    backend.push(
      `-backend-config=dynamodb_table=${process.env.TF_STATE_LOCK_TABLE}`
    )
  }

  return run(["init", "-upgrade", ...backend], cwd, { onLine })
}

export async function plan(
  cwd: string,
  secrets: string[],
  onLine?: (line: string) => void
): Promise<RunResult> {
  return run(["plan", "-out=tisiops.tfplan"], cwd, { secrets, onLine })
}

export async function apply(
  cwd: string,
  secrets: string[],
  onLine?: (line: string) => void
): Promise<RunResult> {
  return run(["apply", "-auto-approve", "tisiops.tfplan"], cwd, {
    secrets,
    onLine,
  })
}

export type TerraformOutputs = {
  instanceId: string
  publicIp: string
  elasticIp: string
  securityGroupId: string
  region: string
  instanceType: string
  sshUsername: string
  keyName: string
}

/** Reads `terraform output -json` and flattens it to the fields we store. */
/**
 * Destroys everything in this deployment's state.
 *
 * Scoped by the working directory and its own state file, so it can only ever
 * remove what this deployment created. Never called without a typed
 * confirmation recorded against the deployment — see the destroy handler.
 */
export async function destroy(
  cwd: string,
  secrets: string[],
  onLine?: (line: string) => void
): Promise<RunResult> {
  return run(["destroy", "-auto-approve"], cwd, { secrets, onLine })
}

export async function readOutputs(
  cwd: string
): Promise<TerraformOutputs | null> {
  const result = await run(["output", "-json"], cwd)
  if (!result.ok) return null

  try {
    const raw = JSON.parse(result.output) as Record<string, { value: unknown }>
    const value = (key: string) => String(raw[key]?.value ?? "")

    return {
      instanceId: value("instance_id"),
      publicIp: value("public_ip"),
      elasticIp: value("elastic_ip"),
      securityGroupId: value("security_group_id"),
      region: value("region"),
      instanceType: value("instance_type"),
      sshUsername: value("ssh_username"),
      keyName: value("key_name"),
    }
  } catch {
    return null
  }
}

/** Missing credentials fail late and cryptically inside Terraform otherwise. */
export function awsConfigured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  )
}
