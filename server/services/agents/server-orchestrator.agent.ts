import { prisma } from "../../db/prisma"
import { sanitizeReply } from "../ai/reply"
import { withSpan } from "../observability/trace"
import { getMonitoringContext } from "../monitoring-context.service"
import { runServerMonitoringAgent } from "./server-monitoring.agent"
import { classifyMonitoringIntent } from "./monitoring-health"
import { planServerRepair, type ServerRepairAction } from "./server-repair.agent"

/**
 * Server Monitoring Orchestration.
 *
 * Routes a user's server-health question: resolve the active server, load the
 * monitoring evidence, run the Monitoring Agent, enrich with logs only when it
 * asks, and produce a repair plan only when a genuine issue is found. Agents
 * collaborate through here — they never call each other directly. Nothing
 * executes; the user approves a plan afterwards.
 */

export type ServerMonitoringOrchestratorAnswer = {
  type: "server_monitoring_flow" | "answer"
  intent: string
  serverId: string | null
  health: string | null
  message: string
  needsRepairAgent: boolean
  repairPlanId: string | null
  needsApproval: boolean
  repairActions: ServerRepairAction[]
}

export function selectServerMessage(): string {
  return "Which server would you like me to check?"
}

async function resolveActiveServer(
  userId: string,
  sessionId: string | null,
  serverId: string | null
): Promise<string | null> {
  if (serverId) {
    const owned = await prisma.server.findFirst({
      where: { id: serverId, userId },
      select: { id: true },
    })
    return owned?.id ?? null
  }

  if (sessionId) {
    const session = await prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId },
      select: { activeServerId: true },
    })
    if (session?.activeServerId) return session.activeServerId
  }

  // Fall back to the most recently active monitored server the user owns.
  const monitored = await prisma.serverMonitoring.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    select: { serverId: true },
  })
  return monitored?.serverId ?? null
}

export async function answerServerMonitoringQuestion(input: {
  userId: string
  sessionId?: string | null
  serverId?: string | null
  question: string
  isAdmin: boolean
}): Promise<ServerMonitoringOrchestratorAnswer> {
  const requestedIntent = classifyMonitoringIntent(input.question)
  const serverId = await resolveActiveServer(input.userId, input.sessionId ?? null, input.serverId ?? null)
  if (!serverId) {
    return {
      type: "answer",
      intent: requestedIntent,
      serverId: null,
      health: null,
      message: selectServerMessage(),
      needsRepairAgent: false,
      repairPlanId: null,
      needsApproval: false,
      repairActions: [],
    }
  }

  // Remember the server for follow-ups ("fix it", "what about memory?").
  if (input.sessionId) {
    await prisma.aiChatSession.update({
      where: { id: input.sessionId },
      data: { activeServerId: serverId },
    }).catch(() => {})
  }

  const context = await getMonitoringContext(input.userId, serverId)
  if (!context) {
    return {
      type: "answer",
      intent: "CHECK_SERVER_HEALTH",
      serverId,
      health: null,
      message: "That server could not be found.",
      needsRepairAgent: false,
      repairPlanId: null,
      needsApproval: false,
      repairActions: [],
    }
  }

  const monitoring = await runServerMonitoringAgent({
    userId: input.userId,
    serverId,
    question: input.question,
    isAdmin: input.isAdmin,
    context,
  })
  if (!monitoring.ok) {
    return {
      type: "answer",
      intent: "CHECK_SERVER_HEALTH",
      serverId,
      health: null,
      message: monitoring.error,
      needsRepairAgent: false,
      repairPlanId: null,
      needsApproval: false,
      repairActions: [],
    }
  }

  const answer = monitoring.answer

  // Logs enrich when the Monitoring Agent asks, or when the user is asking
  // about an app/service going down (server metrics alone cannot show that).
  const wantsLogs = answer.needsLogs || answer.intent === "DIAGNOSE_APP_DOWN"
  const logLines = wantsLogs
    ? await withSpan(
        "agent.logs.enrichment",
        { serverId, health: answer.health },
        async () => context.recentLogs.slice(0, 5).map((log) => `${log.level}: ${log.message}`)
      )
    : []

  let repairPlanId: string | null = null
  let needsApproval = false
  let repairActions: ServerRepairAction[] = []
  const readOnly = answer.intent.startsWith("CHECK_")
  if (answer.needsRepairAgent && !readOnly) {
    const plan = await withSpan(
      "agent.repair.plan_created",
      { serverId, health: answer.health, intent: answer.intent },
      () =>
        planServerRepair({
          userId: input.userId,
          serverId,
          issueType: answer.issueType,
          ctx: context,
          summary: null,
          recentLogs: context.recentLogs,
        })
    )
    if (plan) {
      repairPlanId = plan.repairPlanId
      needsApproval = plan.approvalRequired
      repairActions = plan.actions
    }
  }

  const parts = [answer.answer]
  if (logLines.length > 0) {
    parts.push("", "Relevant logs:", ...logLines.map((line) => `- ${line}`))
  }
  if (needsApproval) {
    parts.push("", "I can create a repair plan for this. Say 'fix it' to approve it.")
  }
  const message = sanitizeReply(parts.join("\n"))

  return {
    type: needsApproval ? "server_monitoring_flow" : "answer",
    intent: answer.intent,
    serverId,
    health: answer.health,
    message,
    needsRepairAgent: readOnly ? false : answer.needsRepairAgent,
    repairPlanId,
    needsApproval,
    repairActions,
  }
}
