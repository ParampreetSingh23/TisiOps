import type { JobType } from "../db/generated/client"

/**
 * What travels through Redis.
 *
 * Three short strings, deliberately. The 30 MB free tier is shared by every
 * queued, active, and retained job, so the payload holds an id the worker uses
 * to read the real row from Postgres — never config, secrets, logs, Terraform
 * plans, repository data, or AI output.
 */

export const DEPLOYMENT_QUEUE = "deploymentQueue"

export const JOB_TYPES = {
  VERCEL_DEPLOYMENT: "VERCEL_DEPLOYMENT",
  AWS_APP_DEPLOYMENT: "AWS_APP_DEPLOYMENT",
  N8N_MANAGED_SERVER_DEPLOYMENT: "N8N_MANAGED_SERVER_DEPLOYMENT",
  RETRY_DEPLOYMENT: "RETRY_DEPLOYMENT",
  REPAIR_DEPLOYMENT: "REPAIR_DEPLOYMENT",
  TERRAFORM_DESTROY: "TERRAFORM_DESTROY",
  SERVER_STOP: "SERVER_STOP",
  SERVER_START: "SERVER_START",
  VERCEL_DELETE: "VERCEL_DELETE",
} as const satisfies Record<JobType, JobType>

/**
 * The entire Redis payload. Roughly 120 bytes of JSON per job.
 *
 * `type` is duplicated from Postgres on purpose: BullMQ uses it as the job
 * name, which is what makes the queue readable in a dashboard without a
 * database lookup. The handler still reads the row before acting on it.
 */
export type DeploymentJobPayload = {
  deploymentJobId: string
  deploymentId: string
  type: JobType
}
