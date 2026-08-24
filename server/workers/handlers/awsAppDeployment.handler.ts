import { runAwsServerDeployment } from "../../services/aws/run"
import type { Handler } from "./types"

export const awsAppDeploymentHandler: Handler = async ({ job, log }) => {
  await log("Running AWS server deployment handler")

  const outcome = await runAwsServerDeployment(job)

  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error }
}
