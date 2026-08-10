import type { Handler } from "./types"

/**
 * AWS app deployment: a GitHub repository onto an EC2 instance in the *user's*
 * own AWS account, using the credentials they connected.
 *
 * Not implemented. This is a deployment template in its own right — its own
 * Terraform module, its own server bootstrap for an arbitrary repository, its
 * own build and health check — and none of that exists yet. The job type,
 * queue routing, and Postgres records are wired up so it can be filled in
 * without touching the queue.
 *
 * It fails immediately and says so rather than pretending to run, because a
 * job that sits "in progress" forever is worse than one that reports the truth.
 */
export const awsAppDeploymentHandler: Handler = async ({ log }) => {
  await log("AWS app deployment is not available yet", "ERROR")

  return {
    ok: false,
    error:
      "Deploying an app to your own AWS account is not available yet. Use the Vercel or n8n templates.",
  }
}
