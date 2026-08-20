import type { Deployment } from "../../db/generated/client"

export async function runGithubAgentSafe(
  deployment: Pick<Deployment, "repositoryOwner" | "repositoryName" | "branch" | "servicePath">
) {
  return {
    repositoryOwner: deployment.repositoryOwner || null,
    repositoryName: deployment.repositoryName || null,
    branch: deployment.branch || null,
    servicePath: deployment.servicePath || null,
  }
}
