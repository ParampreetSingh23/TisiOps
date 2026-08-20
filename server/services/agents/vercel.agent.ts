import type { Deployment } from "../../db/generated/client"
import type { VercelAgentResult } from "./agent.types"

export async function runVercelAgent(
  deployment: Pick<Deployment, "type" | "status" | "statusDetail" | "framework">
): Promise<VercelAgentResult> {
  return {
    vercelStatus: deployment.type === "VERCEL" ? deployment.status : null,
    buildError: deployment.type === "VERCEL" ? deployment.statusDetail : null,
    framework: deployment.framework,
  }
}
