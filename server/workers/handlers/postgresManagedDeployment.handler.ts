import { runPostgresDeployment } from "../../services/postgres/run"
import type { Handler } from "./types"

export const postgresManagedDeploymentHandler: Handler = async ({
  job,
  log,
}) => {
  await log("Running PostgreSQL managed server deployment handler")

  const outcome = await runPostgresDeployment(job)

  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error }
}
