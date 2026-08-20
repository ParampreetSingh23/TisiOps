import type { Deployment } from "../../db/generated/client"

export async function runN8nAgent(deployment: Pick<Deployment, "type" | "status">) {
  return {
    name: "n8n",
    status: deployment.type === "N8N" ? deployment.status : "not_applicable",
    summary:
      deployment.type === "N8N"
        ? "n8n managed-server deployment context available."
        : "Not an n8n deployment.",
  }
}
