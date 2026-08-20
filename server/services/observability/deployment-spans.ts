import { SpanStatusCode } from "@opentelemetry/api"

import { prisma } from "../../db/prisma"
import { logToDeployment } from "../deployment-log.service"
import { withSpan } from "./trace"
import { otelAttrs } from "./trace"
import { healthcheckFailedTotal, sshConnectionFailedTotal, terraformApplyDurationMs } from "./metrics"
import type { DeploymentStepStatus, SafeTelemetryAttrs } from "./telemetry.types"

export const ERROR_CODES = {
  TERRAFORM_INIT_FAILED: "TERRAFORM_INIT_FAILED",
  TERRAFORM_PLAN_FAILED: "TERRAFORM_PLAN_FAILED",
  TERRAFORM_APPLY_FAILED: "TERRAFORM_APPLY_FAILED",
  AWS_PERMISSION_DENIED: "AWS_PERMISSION_DENIED",
  AWS_QUOTA_EXCEEDED: "AWS_QUOTA_EXCEEDED",
  SERVER_NOT_READY: "SERVER_NOT_READY",
  SSH_TIMEOUT: "SSH_TIMEOUT",
  SSH_AUTH_FAILED: "SSH_AUTH_FAILED",
  SSH_PORT_BLOCKED: "SSH_PORT_BLOCKED",
  DOCKER_INSTALL_FAILED: "DOCKER_INSTALL_FAILED",
  DOCKER_COMPOSE_FAILED: "DOCKER_COMPOSE_FAILED",
  CONTAINER_START_FAILED: "CONTAINER_START_FAILED",
  HEALTHCHECK_FAILED: "HEALTHCHECK_FAILED",
  VERCEL_BUILD_FAILED: "VERCEL_BUILD_FAILED",
  VERCEL_OUTPUT_DIRECTORY_ERROR: "VERCEL_OUTPUT_DIRECTORY_ERROR",
  REPAIR_ACTION_FAILED: "REPAIR_ACTION_FAILED",
  UNKNOWN_DEPLOYMENT_ERROR: "UNKNOWN_DEPLOYMENT_ERROR",
} as const

export function inferErrorCode(text: string | null | undefined): string | null {
  const lower = String(text ?? "").toLowerCase()
  if (lower.includes("ssh") && lower.includes("timeout")) return ERROR_CODES.SSH_TIMEOUT
  if (lower.includes("ssh") && lower.includes("auth")) return ERROR_CODES.SSH_AUTH_FAILED
  if (lower.includes("port 22")) return ERROR_CODES.SSH_PORT_BLOCKED
  if (lower.includes("terraform")) return ERROR_CODES.TERRAFORM_APPLY_FAILED
  if (lower.includes("docker compose")) return ERROR_CODES.DOCKER_COMPOSE_FAILED
  if (lower.includes("docker")) return ERROR_CODES.DOCKER_INSTALL_FAILED
  if (lower.includes("health")) return ERROR_CODES.HEALTHCHECK_FAILED
  if (lower.includes("output directory")) return ERROR_CODES.VERCEL_OUTPUT_DIRECTORY_ERROR
  if (lower.includes("vercel")) return ERROR_CODES.VERCEL_BUILD_FAILED
  if (lower.includes("repair")) return ERROR_CODES.REPAIR_ACTION_FAILED
  if (lower.includes("container")) return ERROR_CODES.CONTAINER_START_FAILED
  return lower ? ERROR_CODES.UNKNOWN_DEPLOYMENT_ERROR : null
}

export async function logDeploymentStep(input: {
  deploymentId: string
  jobId?: string | null
  step: string
  status: DeploymentStepStatus
  message: string
  durationMs?: number | null
  errorCode?: string | null
  attrs?: SafeTelemetryAttrs
}) {
  return logToDeployment({
    deploymentId: input.deploymentId,
    jobId: input.jobId,
    level:
      input.status === "failed"
        ? "ERROR"
        : input.status === "success"
          ? "SUCCESS"
          : "INFO",
    message: input.message,
    step: input.step,
    stepStatus: input.status,
    errorCode: input.errorCode,
    durationMs: input.durationMs ?? null,
    metadataJson: input.attrs ?? {},
  })
}

export async function recordDeploymentStep<T>(input: {
  step: string
  deploymentId: string
  jobId?: string | null
  attrs?: SafeTelemetryAttrs
  startedMessage?: string
  successMessage?: string
  run: () => Promise<T>
}): Promise<T> {
  const started = Date.now()
  await logDeploymentStep({
    deploymentId: input.deploymentId,
    jobId: input.jobId,
    step: input.step,
    status: "started",
    message: input.startedMessage ?? `${input.step} started`,
    attrs: input.attrs,
  })

  return withSpan(input.step, input.attrs ?? {}, async (span) => {
    try {
      const result = await input.run()
      const durationMs = Date.now() - started
      span.setAttribute("durationMs", durationMs)
      await logDeploymentStep({
        deploymentId: input.deploymentId,
        jobId: input.jobId,
        step: input.step,
        status: "success",
        message: input.successMessage ?? `${input.step} completed`,
        durationMs,
        attrs: input.attrs,
      })
      if (input.step === "terraform.apply") {
        terraformApplyDurationMs.record(durationMs, otelAttrs(input.attrs))
      }
      return result
    } catch (cause) {
      const durationMs = Date.now() - started
      const errorCode = inferErrorCode(cause instanceof Error ? cause.message : null)
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorCode ?? undefined })
      span.setAttribute("errorCode", errorCode ?? "UNKNOWN_DEPLOYMENT_ERROR")
      await logDeploymentStep({
        deploymentId: input.deploymentId,
        jobId: input.jobId,
        step: input.step,
        status: "failed",
        message: cause instanceof Error ? cause.message : `${input.step} failed`,
        errorCode,
        durationMs,
        attrs: input.attrs,
      })
      if (errorCode === ERROR_CODES.SSH_TIMEOUT) sshConnectionFailedTotal.add(1, otelAttrs(input.attrs))
      if (errorCode === ERROR_CODES.HEALTHCHECK_FAILED) healthcheckFailedTotal.add(1, otelAttrs(input.attrs))
      throw cause
    }
  })
}

export async function getDeploymentTelemetrySummary(deploymentId: string) {
  const [deployment, logs, jobs] = await Promise.all([
    prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { id: true, template: true, status: true, failureCode: true },
    }),
    prisma.deploymentLog.findMany({
      where: { deploymentId, step: { not: null } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.deploymentJob.findMany({
      where: { deploymentId },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { attempts: true },
    }),
  ])

  if (!deployment) return null

  const successes = logs.filter((log) => log.stepStatus === "success")
  const failed = [...logs].reverse().find((log) => log.stepStatus === "failed")
  const durations = Object.fromEntries(
    logs
      .filter((log) => log.step && log.durationMs !== null)
      .map((log) => [log.step as string, log.durationMs as number])
  )

  return {
    deploymentId: deployment.id,
    traceId: logs.find((log) => log.traceId)?.traceId ?? null,
    templateId: deployment.template,
    status: deployment.status,
    failedStep: failed?.step ?? null,
    lastSuccessfulStep: successes.at(-1)?.step ?? null,
    errorCode: failed?.errorCode ?? deployment.failureCode ?? null,
    attempts: jobs[0]?.attempts ?? 0,
    durations,
    safeEvidence: logs.slice(-20).map((log) => log.message),
    safeLogs: logs.slice(-20).map((log) => ({
      step: log.step,
      status: log.stepStatus,
      message: log.message,
      errorCode: log.errorCode,
      durationMs: log.durationMs,
      createdAt: log.createdAt.toISOString(),
    })),
  }
}
