import { clerkClient } from "@clerk/express"

import { prisma } from "../../db/prisma"
import {
  latestAttempt,
  readEnvironmentVariables,
} from "../../services/deployments/index"
import { runVercelAttempt } from "../../services/vercel/agent"
import type { Handler } from "./types"

/**
 * Vercel deployment: reads the repository with the owner's own GitHub token,
 * uploads the source, waits for the build, and marks the deployment live only
 * once Vercel reports ready and the public URL answers.
 *
 * Everything it needs comes from Postgres. The Redis message carried three ids.
 */
export const vercelDeploymentHandler: Handler = async ({
  deploymentId,
  log,
}) => {
  await log("Running Vercel deployment handler")

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { userId: true, user: { select: { clerkId: true } } },
  })

  if (!deployment) return { ok: false, error: "Deployment not found." }

  // The attempt row was opened by the API when the user approved, so the
  // worker continues that attempt rather than starting a second one.
  const attempt = await latestAttempt(deploymentId)
  if (!attempt) {
    return { ok: false, error: "This deployment has no attempt to run." }
  }

  // Decrypted here and handed straight to the run. Values are never logged,
  // returned, or placed in the queue.
  const environment = await readEnvironmentVariables(
    deployment.userId,
    deploymentId
  )

  if (!environment.reusable) {
    return {
      ok: false,
      error:
        "Environment variables need to be entered again because the saved values could not be read.",
    }
  }

  await log("GitHub source prepared")

  const result = await runVercelAttempt({
    deploymentId,
    attemptId: attempt.id,
    // Reading the repository requires the owner's GitHub token, which Clerk
    // holds against their user — so the worker acts as them, not as itself.
    clerkUserId: deployment.user.clerkId,
    users: clerkClient.users,
    environmentVariables: environment.variables,
  })

  if (result.status === "LIVE") return { ok: true }

  // ACCESS_BLOCKED and PLACEHOLDER are recorded outcomes, not crashes: the
  // deployment row already explains itself, so the job succeeded at its work.
  if (result.status === "ACCESS_BLOCKED" || result.status === "PLACEHOLDER") {
    return { ok: true }
  }

  return {
    ok: false,
    error: result.statusDetail ?? "The Vercel deployment did not complete.",
  }
}
