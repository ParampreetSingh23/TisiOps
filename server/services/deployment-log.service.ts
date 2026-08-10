import type { DeploymentLog, LogLevel } from "../db/generated/client"
import { prisma } from "../db/prisma"
import { redact } from "./redaction"

export { redact } from "./redaction"

/**
 * Deployment logs. Every worker and API line goes through here, which is what
 * makes the redaction below unavoidable rather than a convention.
 */

export async function logToDeployment(input: {
  deploymentId: string
  message: string
  level?: LogLevel
  jobId?: string | null
  attemptId?: string | null
}): Promise<DeploymentLog> {
  return prisma.deploymentLog.create({
    data: {
      deploymentId: input.deploymentId,
      message: redact(input.message),
      level: input.level ?? "INFO",
      jobId: input.jobId ?? null,
      attemptId: input.attemptId ?? null,
    },
  })
}

/** A bound logger, so a handler cannot forget which job it is writing for. */
export function jobLogger(deploymentId: string, jobId: string) {
  return (message: string, level: LogLevel = "INFO") =>
    logToDeployment({ deploymentId, jobId, message, level })
}
