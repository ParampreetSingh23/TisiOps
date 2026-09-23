import { runPostgresDeployment } from "../../services/postgres/run"
import { runByokPostgresDeployment } from "../../services/postgres/byok-run"
import type { Handler } from "./types"

export const postgresManagedDeploymentHandler: Handler = async ({
  job,
  log,
}) => {
  const byok = Boolean((job.payloadJson as { targetServerId?: string }).targetServerId)
  await log(byok ? "Running PostgreSQL connected-server deployment handler" : "Running PostgreSQL managed server deployment handler")

  const outcome = byok
    ? await runByokPostgresDeployment(job, log)
    : await runPostgresDeployment(job)

  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error }
}
