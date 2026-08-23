import { agentModelMap } from "../ai-gateway/agent-model-map"
import { aiGatewayChat } from "../ai-gateway/ai-gateway.service"
import { withSpan } from "../observability/trace"
import { getMonitoringContext } from "../monitoring-context.service"
import {
  buildServerHealthSummary,
  classifyMonitoringIntent,
  type IssueType,
  type ServerHealth,
  type HealthSummary,
  type MonitoringContext,
  type MonitoringIntent,
} from "./monitoring-health"

/**
 * TisiOps Monitoring Agent.
 *
 * The diagnosis brain for connected servers. It reads evidence already stored
 * by TisiOps (Phase 5 snapshot + monitoring status) — never SSH, never a live
 * probe. Deterministic helpers classify health and build the evidence; the
 * configured AI Gateway model only phrases the answer, and only when evidence
 * exists. It never executes anything.
 */

const SYSTEM_PROMPT = `You are the TisiOps Monitoring Agent.

Your job is to diagnose the health of connected servers using only monitoring evidence provided by TisiOps.

Use CPU, memory, disk, Docker status, container health, heartbeat, health checks, and recent logs.

Do not invent metrics or server state.
If data is stale, explicitly say it is stale.
If evidence is insufficient, say what information is missing.
Do not execute commands.
Do not SSH into servers.
Do not modify infrastructure.
Do not restart services.

You may recommend the next diagnostic or repair step. Actual repair actions must be handled by the TisiOps Repair Agent and worker system after approval.`

export type ServerMonitoringAnswer = {
  type: "server_monitoring_answer"
  serverId: string
  health: ServerHealth
  issueType: IssueType
  answer: string
  evidence: string[]
  likelyCause: string
  recommendedNextStep: string
  freshness: "FRESH" | "STALE" | "UNAVAILABLE"
  needsRepairAgent: boolean
  needsLogs: boolean
  intent: MonitoringIntent
}

export type MonitoringAgentRunInput = {
  userId: string
  serverId: string
  question: string
  isAdmin: boolean
  context?: MonitoringContext | null
}

export type MonitoringAgentRunResult =
  | { ok: true; answer: ServerMonitoringAnswer }
  | { ok: false; status: number; error: string }

function statusOnlyAnswer(status: string): string {
  switch (status) {
    case "INSTALLING":
      return "Monitoring setup is still in progress."
    case "UPGRADING":
      return "Monitoring is upgrading."
    case "FAILED":
      return "Monitoring setup failed."
    case "DISABLED":
      return "Monitoring is disabled."
    default:
      return "Monitoring is not installed on this server."
  }
}

function deterministicAnswer(ctx: MonitoringContext, summary: HealthSummary): string {
  const headline =
    summary.health === "HEALTHY"
      ? "Your server is healthy."
      : summary.health === "CRITICAL"
        ? "Your server is in a critical state."
        : summary.health === "DEGRADED"
          ? "Your server is degraded."
          : "Server health is unknown."
  const lines = [headline, ...summary.evidence.map((line) => `- ${line}`), summary.likelyCause]
  if (ctx.freshness === "STALE") {
    lines.push("The latest snapshot is the last known data.")
  }
  return lines.join("\n")
}

function pct(value: number | null): string | null {
  return value == null ? null : `${Math.round(value)}%`
}

function freshnessLine(ctx: MonitoringContext): string | null {
  if (!ctx.collectedAt) return null
  const when = new Date(ctx.collectedAt)
  if (Number.isNaN(when.getTime())) return null
  const ageSeconds = Math.max(0, Math.round((Date.now() - when.getTime()) / 1000))
  const age =
    ageSeconds < 60
      ? `${ageSeconds} seconds`
      : `${Math.round(ageSeconds / 60)} minutes`
  return ctx.freshness === "STALE"
    ? `Last known snapshot was collected ${age} ago and is stale.`
    : `Latest snapshot was collected ${age} ago.`
}

function metricAnswer(ctx: MonitoringContext, intent: MonitoringIntent): string | null {
  if (intent === "CHECK_CPU_USAGE") {
    const value = pct(ctx.metrics.cpuPercent)
    if (!value) return "Monitoring is active, but no CPU metric has been collected yet."
    return [`CPU usage: ${value}.`, freshnessLine(ctx)].filter(Boolean).join("\n")
  }
  if (intent === "CHECK_MEMORY_USAGE") {
    const value = pct(ctx.metrics.memoryPercent)
    if (!value) return "Monitoring is active, but no memory metric has been collected yet."
    return [`Memory usage: ${value}.`, freshnessLine(ctx)].filter(Boolean).join("\n")
  }
  if (intent === "CHECK_DISK_USAGE") {
    const value = pct(ctx.metrics.diskPercent)
    if (!value) return "Monitoring is active, but no disk metric has been collected yet."
    return [`Disk usage: ${value}.`, freshnessLine(ctx)].filter(Boolean).join("\n")
  }
  if (intent === "CHECK_DOCKER_STATUS") {
    return [
      `Docker status: ${ctx.docker.status?.toLowerCase() ?? "unknown"}.`,
      `Containers: ${ctx.docker.containerCount}.`,
      `Unhealthy containers: ${ctx.docker.unhealthyContainers}.`,
      freshnessLine(ctx),
    ].filter(Boolean).join("\n")
  }
  if (intent === "CHECK_CONTAINER_HEALTH") {
    return [
      ctx.docker.unhealthyContainers === 0
        ? "No unhealthy containers."
        : `Unhealthy containers: ${ctx.docker.unhealthyContainers}.`,
      `Containers: ${ctx.docker.containerCount}.`,
      freshnessLine(ctx),
    ].filter(Boolean).join("\n")
  }
  if (intent === "CHECK_LAST_HEARTBEAT") {
    return ctx.lastHeartbeatAt
      ? `Last heartbeat: ${ctx.lastHeartbeatAt}.`
      : "Monitoring is active, but no heartbeat has been recorded yet."
  }
  return null
}

async function phraseAnswer(
  input: MonitoringAgentRunInput,
  ctx: MonitoringContext,
  summary: HealthSummary,
  intent: MonitoringIntent
): Promise<string> {
  const userPrompt = `Question: ${input.question}

Evidence:
${summary.evidence.map((line) => `- ${line}`).join("\n")}

Server health: ${summary.health}
Likely cause: ${summary.likelyCause}
Recommended next step: ${summary.recommendedNextStep}
Data freshness: ${ctx.freshness}

Give a concise, human-friendly answer to the question, grounded only in this evidence. If the data is stale, say so.`

  try {
    const result = await withSpan(
      "agent.monitoring.ai_requested",
      { serverId: ctx.serverId, intent, health: summary.health },
      () =>
        aiGatewayChat({
          userId: input.userId,
          isAdmin: input.isAdmin,
          source: "AGENT",
          agentName: "Monitoring Agent",
          modelCode: agentModelMap.monitoring,
          temperature: 0.3,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        })
    )
    return result.content.trim() || deterministicAnswer(ctx, summary)
  } catch {
    // The gateway must never take the diagnosis down: fall back to the facts.
    return deterministicAnswer(ctx, summary)
  }
}

export async function runServerMonitoringAgent(
  input: MonitoringAgentRunInput
): Promise<MonitoringAgentRunResult> {
  const context = await withSpan(
    "agent.monitoring.context_loaded",
    { serverId: input.serverId },
    async () => input.context ?? (await getMonitoringContext(input.userId, input.serverId))
  )
  if (!context) {
    return { ok: false, status: 404, error: "Server not found" }
  }

  const intent = classifyMonitoringIntent(input.question)
  const summary = await withSpan(
    "agent.monitoring.health_evaluated",
    { serverId: context.serverId, freshness: context.freshness },
    async () => buildServerHealthSummary(context)
  )

  const answer = await withSpan(
    "agent.monitoring.started",
    { serverId: context.serverId, intent, health: summary.health },
    async () => {
      // Evidence-first: no snapshot or not-yet-active monitoring gets a direct,
      // grounded answer — the model is never asked to fabricate metrics.
      if (context.monitoringStatus !== "ACTIVE") {
        return statusOnlyAnswer(context.monitoringStatus)
      }
      if (context.freshness === "UNAVAILABLE") {
        return metricAnswer(context, intent) ?? "Monitoring is active, but no metric snapshot has been collected yet."
      }
      const direct = metricAnswer(context, intent)
      if (direct) return direct
      return phraseAnswer(input, context, summary, intent)
    }
  )

  return {
    ok: true,
    answer: {
      type: "server_monitoring_answer",
      serverId: context.serverId,
      health: summary.health,
      issueType: summary.issueType,
      answer,
      evidence: summary.evidence,
      likelyCause: summary.likelyCause,
      recommendedNextStep: summary.recommendedNextStep,
      freshness: context.freshness,
      needsRepairAgent: summary.needsRepairAgent,
      needsLogs: summary.needsLogs,
      intent,
    },
  }
}
