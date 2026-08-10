import { runN8nDeployment } from "../../services/n8n/run"
import type { Handler } from "./types"

/**
 * Managed n8n server: Terraform creates the instance, cloud-init configures it,
 * and a health check decides when it is live.
 *
 * The run itself already lives in services/n8n/run.ts, unchanged by the move to
 * Redis — the queue replaced how the work is picked up, not what it does.
 */
export const n8nManagedDeploymentHandler: Handler = async ({ job, log }) => {
  await log("Running n8n managed server deployment handler")

  const outcome = await runN8nDeployment(job)

  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error }
}
