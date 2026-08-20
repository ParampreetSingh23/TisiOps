import type { Deployment } from "../../db/generated/client"
import type { TerraformAgentResult } from "./agent.types"

function output(outputs: unknown, key: string): string | null {
  if (!outputs || typeof outputs !== "object") return null
  const value = (outputs as Record<string, unknown>)[key]
  if (typeof value === "string") return value
  if (value && typeof value === "object") {
    const nested = (value as Record<string, unknown>).value
    return typeof nested === "string" ? nested : null
  }
  return null
}

export async function runTerraformAgent(
  deployment: Pick<Deployment, "status" | "terraformOutputs">
): Promise<TerraformAgentResult> {
  const outputs = deployment.terraformOutputs
  return {
    terraformStatus: outputs ? "SUCCEEDED" : deployment.status,
    outputsAvailable: Boolean(outputs),
    instanceId: output(outputs, "instance_id"),
    elasticIp: output(outputs, "elastic_ip") ?? output(outputs, "public_ip"),
    securityGroupId: output(outputs, "security_group_id"),
  }
}
