import type { Deployment } from "../../db/generated/client"

export async function runPostgresAgent(deployment: Pick<Deployment, "type" | "status">) {
  return {
    status: deployment.type === "POSTGRES" ? deployment.status : "not_applicable",
    summary:
      deployment.type === "POSTGRES"
        ? "PostgreSQL managed-server deployment context available."
        : "Not a PostgreSQL deployment.",
  }
}
