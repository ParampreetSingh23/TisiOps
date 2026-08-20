import type { AwsAgentResult, TerraformAgentResult } from "./agent.types"

export async function runAwsAgent(terraform: TerraformAgentResult): Promise<AwsAgentResult> {
  return {
    ec2State: terraform.instanceId ? "unknown" : null,
    elasticIpAttached: Boolean(terraform.elasticIp),
    securityGroupPorts: [],
    instanceStatusChecks: terraform.instanceId ? "unknown" : null,
  }
}
