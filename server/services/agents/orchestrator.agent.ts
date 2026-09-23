import { prisma } from "../../db/prisma"
import { createAndQueueJob } from "../deployment-job.service"
import { logToDeployment } from "../deployment-log.service"
import { runAwsAgent } from "./aws.agent"
import { rememberRepair } from "./agent-memory"
import { resolveAgentContext } from "./agent-context"
import type { AgentIntent, RepairDiagnosis, RepairAction, SpecialistEvidence } from "./agent.types"
import { runGithubAgentSafe } from "./github.agent"
import { runLogsAgent } from "./logs.agent"
import { runMonitoringAgent } from "./monitoring.agent"
import { runN8nAgent } from "./n8n.agent"
import { runPostgresAgent } from "./postgres.agent"
import { runRedisAgent } from "./redis.agent"
import { runRepairAgent } from "./repair.agent"
import { runServerAgent } from "./server.agent"
import { runTerraformAgent } from "./terraform.agent"
import { runVercelAgent } from "./vercel.agent"
import { stagingIntentFromText } from "./staging.agent"

export const TISIOPS_SCOPE_MESSAGE =
  "I can only help with TisiOps deployment, infrastructure, cloud, GitHub, Docker, monitoring, logs, and DevOps planning. Ask me something about your deployment or infrastructure setup."

export const MISSING_REPAIR_TARGET_MESSAGE =
  "Which deployment do you want me to fix? Open a deployment or mention the deployment first, then I can diagnose it."

const DEVOPS_TOPIC =
  /\b(tisiops|deploy(?:ed|ments?)?|infrastructure|infra|cloud|aws|ec2|vercel|github|docker|container|terraform|n8n|redis|postgres|postgresql|logs?|monitoring|rollback|restart|production|staging|ssl|domain|dns|vps|ssh|firewall|database|repo|repository)\b/i

const TISIOPS_REFERENCE =
  /\b(tisi\s*ops|tisi-?ops?|tisops|this app|this platform|my platform)\b/i

const SERVER_OPS =
  /\b(my|the|this|which|what)\s+server\b|\bserver\b[\s\S]{0,40}\b(stopped|down|running|status|health|restart|start|resume|fix|repair|connect|ssh|aws|vps|deployment)\b/i

const SERVER_LOOKUP = /\bservers?\b/i
const DEPLOYMENT_LOOKUP = /\bdeploy(?:ed|ment|ments)?\b/i
const LAST_LOOKUP = /\b(last|latest|most recent|recent)\b/i
const LIST_LOOKUP = /\b(show|list|view|see|display|get)\b/i
const STATUS_LOOKUP = /\b(status|stopped|running|health|up|down|state)\b/i

export function monitoringIntentFromText(text: string): AgentIntent | null {
  const t = text.toLowerCase()

  if (/\b(cpu|processor)\b/.test(t)) {
    return /\b(why|high|pegged|diagnose)\b/.test(t)
      ? "DIAGNOSE_HIGH_CPU"
      : "CHECK_CPU_USAGE"
  }
  if (/\b(memory|ram)\b/.test(t)) {
    return /\b(why|high|leak|diagnose)\b/.test(t)
      ? "DIAGNOSE_HIGH_MEMORY"
      : "CHECK_MEMORY_USAGE"
  }
  if (/\b(disk|storage|space)\b/.test(t)) {
    return /\b(why|high|pressure|full|almost|diagnose)\b/.test(t)
      ? "DIAGNOSE_DISK_PRESSURE"
      : "CHECK_DISK_USAGE"
  }
  if (/\bdocker\b/.test(t)) return "CHECK_DOCKER_STATUS"
  if (/\b(container|unhealthy|restarting)\b/.test(t)) return "CHECK_CONTAINER_HEALTH"
  if (/\b(heartbeat|last monitored|last check|when.*monitor)\b/.test(t)) {
    return "CHECK_LAST_HEARTBEAT"
  }
  if (/\b(slow|performance|lag|sluggish)\b/.test(t)) return "DIAGNOSE_SERVER_SLOWNESS"
  if (/\b(monitoring?|metrics?)\b/.test(t)) return "CHECK_MONITORING_STATUS"
  if (/\bserver\b/.test(t) && /\b(health|healthy)\b/.test(t)) return "CHECK_SERVER_HEALTH"

  return null
}

export function isServerMonitoringIntent(intent: AgentIntent): boolean {
  return [
    "CHECK_MONITORING_STATUS",
    "CHECK_SERVER_HEALTH",
    "CHECK_CPU_USAGE",
    "CHECK_MEMORY_USAGE",
    "CHECK_DISK_USAGE",
    "CHECK_DOCKER_STATUS",
    "CHECK_CONTAINER_HEALTH",
    "CHECK_LAST_HEARTBEAT",
    "DIAGNOSE_SERVER_SLOWNESS",
    "DIAGNOSE_HIGH_CPU",
    "DIAGNOSE_HIGH_MEMORY",
    "DIAGNOSE_DISK_PRESSURE",
    "DIAGNOSE_CONTAINER_FAILURE",
    "DIAGNOSE_APP_DOWN",
  ].includes(intent)
}

export function isAccountMemoryQuestion(text: string): boolean {
  return /\bwhat(?:'s| is)\s+my\s+name\b|\bwho\s+am\s+i\b/i.test(text)
}

/** Small talk is acknowledged without widening the DevOps-only scope. */
export function greetingReply(text: string): string | null {
  if (/^\s*(hi|hello|hey|good morning|good afternoon|good evening)[!.\s]*$/i.test(text)) {
    return "Hi! How can I help with your deployment, servers, monitoring, or infrastructure today?"
  }
  return null
}

export function isRepairApprovalText(text: string): boolean {
  return /\b(fix it|do the repair|retry that|repair it|retry it|start it|resume it|redeploy it)\b/i.test(text)
}

export function repairTargetMessageWhenMissing(text: string): string | null {
  return isRepairApprovalText(text) ? MISSING_REPAIR_TARGET_MESSAGE : null
}

function hasDevopsIntent(text: string): boolean {
  return (
    DEVOPS_TOPIC.test(text) ||
    TISIOPS_REFERENCE.test(text) ||
    SERVER_OPS.test(text) ||
    (SERVER_LOOKUP.test(text) &&
      (LIST_LOOKUP.test(text) ||
        LAST_LOOKUP.test(text) ||
        STATUS_LOOKUP.test(text) ||
        /\b(create|created|deploy|deployed)\b/i.test(text)))
  )
}

export function classifyIntent(text: string): AgentIntent {
  if (isAccountMemoryQuestion(text)) return "GENERAL_TISIOPS_HELP"
  if (isRepairApprovalText(text)) return "REPAIR_DEPLOYMENT"
  const stagingIntent = stagingIntentFromText(text)
  if (stagingIntent) return stagingIntent
  if (/\bservers\b/i.test(text) && /\b(live|online|available|reachable)\b/i.test(text)) {
    return "LIST_SERVERS"
  }
  const monitoringIntent = monitoringIntentFromText(text)
  if (monitoringIntent) return monitoringIntent
  if (!hasDevopsIntent(text)) return "OUT_OF_SCOPE"
  if (/\bterraform\b/i.test(text)) return "CHECK_TERRAFORM_STATE"
  if (/\b(why|diagnose|failed|failure|error)\b/i.test(text)) {
    return "DIAGNOSE_DEPLOYMENT"
  }
  if (
    SERVER_LOOKUP.test(text) &&
    (LAST_LOOKUP.test(text) || /\bwhich\s+server\b[\s\S]{0,60}\b(create|created|deploy|deployed)\b/i.test(text))
  ) {
    return "GET_LAST_SERVER"
  }
  if (DEPLOYMENT_LOOKUP.test(text) && LAST_LOOKUP.test(text)) {
    return "GET_LAST_DEPLOYMENT"
  }
  if (SERVER_LOOKUP.test(text) && LIST_LOOKUP.test(text)) {
    return "LIST_SERVERS"
  }
  if (DEPLOYMENT_LOOKUP.test(text) && LIST_LOOKUP.test(text)) {
    return "LIST_DEPLOYMENTS"
  }
  if (SERVER_LOOKUP.test(text) && STATUS_LOOKUP.test(text)) {
    return "GET_SERVER_STATUS"
  }
  if (DEPLOYMENT_LOOKUP.test(text) && STATUS_LOOKUP.test(text)) {
    return "GET_DEPLOYMENT_STATUS"
  }
  if (
    /\b(fix|repair|heal|retry|resume|start|restart|not opening|down|unreachable)\b/i.test(
      text
    )
  ) {
    return "REPAIR_DEPLOYMENT"
  }
  if (/\b(status|stopped|running|health|which server|what server)\b/i.test(text)) {
    return "CHECK_SERVER_HEALTH"
  }
  if (/\blogs?\b/i.test(text)) return "CHECK_LOGS"
  return "GENERAL_TISIOPS_HELP"
}

export function agentNameForIntent(intent: AgentIntent): string {
  if (intent.includes("STAGING")) return "StagingAgent"
  if (intent === "CHECK_TERRAFORM_STATE") return "TerraformAgent"
  if (
    [
      "GET_DEPLOYMENT_STATUS",
      "GET_LAST_DEPLOYMENT",
      "LIST_DEPLOYMENTS",
      "DIAGNOSE_DEPLOYMENT",
      "REPAIR_DEPLOYMENT",
    ].includes(intent)
  ) {
    return "DeploymentAgent"
  }
  return "OrchestratorAgent"
}

export async function diagnoseRepair(input: {
  userId: string
  sessionId?: string | null
  deploymentId?: string | null
}): Promise<RepairDiagnosis | null> {
  const context = await resolveAgentContext({ ...input, allowLatestFallback: true })
  if (!context.activeDeploymentId) return null

  const deployment = await prisma.deployment.findFirst({
    where: { id: context.activeDeploymentId, userId: input.userId },
  })
  if (!deployment) return null

  await logToDeployment({
    deploymentId: deployment.id,
    message: "AI repair diagnosis started",
  })

  const logs = await runLogsAgent(deployment.id)
  const monitoring = await runMonitoringAgent(deployment)
  const terraform = await runTerraformAgent(deployment)
  const aws = await runAwsAgent(terraform)
  const vercel = await runVercelAgent(deployment)
  const server = await runServerAgent(deployment.id)
  const service =
    deployment.type === "N8N"
      ? await runN8nAgent(deployment)
      : { name: deployment.type.toLowerCase(), status: deployment.status, summary: "Template-specific context checked." }

  await runGithubAgentSafe(deployment)

  const evidence: SpecialistEvidence = {
    deployment,
    logs,
    monitoring,
    terraform,
    aws,
    vercel,
    server,
    service,
    redis: await runRedisAgent(),
    postgres: await runPostgresAgent(deployment),
  }

  const diagnosis = await runRepairAgent(evidence)

  const plan = await prisma.repairPlan.create({
    data: {
      userId: input.userId,
      deploymentId: deployment.id,
      status: diagnosis.approvalRequired ? "APPROVAL_REQUIRED" : "DRAFT",
      failurePoint: diagnosis.failurePoint,
      lastSuccessfulStep: diagnosis.lastSuccessfulStep,
      likelyCause: diagnosis.likelyCause,
      recommendedFix: diagnosis.recommendedFix,
      riskLevel: diagnosis.riskLevel,
      approvalRequired: diagnosis.approvalRequired,
      actionsJson: diagnosis.repairActions as never,
      evidenceJson: diagnosis.evidence as never,
    },
  })

  const stored = { ...diagnosis, repairPlanId: plan.id }

  await prisma.agentRun.create({
    data: {
      userId: input.userId,
      sessionId: input.sessionId ?? null,
      deploymentId: deployment.id,
      agentName: "Orchestrator Agent",
      intent: "DIAGNOSE_DEPLOYMENT",
      inputSummary: deployment.id,
      outputSummary: stored.failurePoint,
      status: "COMPLETED",
    },
  })

  await logToDeployment({
    deploymentId: deployment.id,
    message: "Repair Agent identified failure point",
  })
  await logToDeployment({
    deploymentId: deployment.id,
    message: "Repair plan created",
    level: "SUCCESS",
  })

  await rememberRepair({ userId: input.userId, sessionId: input.sessionId, diagnosis: stored })
  return stored
}

function actions(plan: { actionsJson: unknown }): RepairAction[] {
  return Array.isArray(plan.actionsJson) ? (plan.actionsJson as RepairAction[]) : []
}

export async function approveRepair(input: {
  userId: string
  repairPlanId: string
  repairActionId?: string | null
}) {
  const plan = await prisma.repairPlan.findFirst({
    where: { id: input.repairPlanId, userId: input.userId },
  })
  if (!plan) return { ok: false as const, status: 404, error: "Repair plan not found" }

  const selected =
    actions(plan).find((item) => item.id === input.repairActionId) ??
    actions(plan).find((item) => item.requiresApproval && item.implemented)

  if (!selected) return { ok: false as const, status: 422, error: "Repair action not found" }
  if (!selected.implemented || !selected.workerAction) {
    return { ok: false as const, status: 422, error: "This repair action is planned but not implemented yet." }
  }
  if (selected.risk === "DESTRUCTIVE") {
    return { ok: false as const, status: 422, error: "Type DELETE to confirm destructive repairs." }
  }

  const updated = await prisma.repairPlan.update({
    where: { id: plan.id },
    data: { status: "APPROVED" },
  })

  const queued = await createAndQueueJob({
    deploymentId: updated.deploymentId,
    type: "REPAIR_DEPLOYMENT",
    payload: { action: selected.workerAction, repairActionId: selected.id, repairPlanId: plan.id },
  })

  await prisma.repairPlan.update({
    where: { id: plan.id },
    data: { status: queued.ok ? "QUEUED" : "FAILED" },
  })

  await logToDeployment({
    deploymentId: updated.deploymentId,
    jobId: queued.job.id,
    message: "Repair job queued",
    level: queued.ok ? "SUCCESS" : "ERROR",
  })

  return queued.ok
    ? {
        ok: true as const,
        deploymentId: updated.deploymentId,
        jobId: queued.job.id,
        progressUrl: `/dashboard/deployments/${updated.deploymentId}/progress`,
      }
    : { ok: false as const, status: 503, error: queued.error }
}
