import type { DeploymentLog, LogLevel } from "../db/generated/client"
import { prisma } from "../db/prisma"
import { activeTraceIds } from "./observability/trace"
import { sanitizeLogMetadata } from "./observability/logs"
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
  step?: string | null
  stepStatus?: string | null
  errorCode?: string | null
  durationMs?: number | null
  metadataJson?: Record<string, unknown> | null
}): Promise<DeploymentLog> {
  const ids = activeTraceIds()
  return prisma.deploymentLog.create({
    data: {
      deploymentId: input.deploymentId,
      message: redact(input.message),
      level: input.level ?? "INFO",
      jobId: input.jobId ?? null,
      attemptId: input.attemptId ?? null,
      step: input.step ?? null,
      stepStatus: input.stepStatus ?? null,
      errorCode: input.errorCode ?? null,
      durationMs: input.durationMs ?? null,
      traceId: ids.traceId,
      spanId: ids.spanId,
      metadataJson: input.metadataJson
        ? (sanitizeLogMetadata(input.metadataJson) as never)
        : undefined,
    },
  })
}

/** A bound logger, so a handler cannot forget which job it is writing for. */
export function jobLogger(deploymentId: string, jobId: string) {
  return (message: string, level: LogLevel = "INFO") =>
    logToDeployment({ deploymentId, jobId, message, level })
}
