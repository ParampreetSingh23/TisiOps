import { prisma } from "../../db/prisma"
import { enqueueServerRepair } from "../../queues/monitoring.queue"
import {
  primaryRepairAction,
  type ServerRepairAction,
} from "../agents/server-repair.agent"

/**
 * Server repair is plan → approve → one fixed worker job. Nothing executes
 * before approval, and approval is idempotent: the queue jobId folds the plan
 * in, so a repeated "yes" cannot queue the same repair twice.
 */

export type SafeServerRepairPlan = {
  id: string
  serverId: string
  issueType: string
  diagnosis: string
  evidence: string[]
  actions: ServerRepairAction[]
  status: string
  approvalRequired: boolean
  createdAt: string
}

export function toSafeServerRepairPlan(
  plan: {
    id: string
    serverId: string
    issueType: string
    diagnosis: string
    evidenceJson: unknown
    actionsJson: unknown
    status: string
    approvalRequired: boolean
    createdAt: Date
  }
): SafeServerRepairPlan {
  return {
    id: plan.id,
    serverId: plan.serverId,
    issueType: plan.issueType,
    diagnosis: plan.diagnosis,
    evidence: Array.isArray(plan.evidenceJson) ? (plan.evidenceJson as string[]) : [],
    actions: Array.isArray(plan.actionsJson) ? (plan.actionsJson as ServerRepairAction[]) : [],
    status: plan.status,
    approvalRequired: plan.approvalRequired,
    createdAt: plan.createdAt.toISOString(),
  }
}

/** The latest awaiting-approval plan for the session's active server, if any. */
export async function pendingServerRepairForSession(
  userId: string,
  sessionId: string
): Promise<SafeServerRepairPlan | null> {
  const session = await prisma.aiChatSession.findFirst({
    where: { id: sessionId, userId },
    select: { activeServerId: true },
  })
  if (!session?.activeServerId) return null

  const plan = await prisma.serverRepairPlan.findFirst({
    where: {
      userId,
      serverId: session.activeServerId,
      status: "APPROVAL_REQUIRED",
    },
    orderBy: { createdAt: "desc" },
  })
  return plan ? toSafeServerRepairPlan(plan) : null
}

export async function approveServerRepair(
  userId: string,
  repairPlanId: string
): Promise<
  | { ok: true; repairPlanId: string; repairActionId: string }
  | { ok: false; status: number; error: string }
> {
  const plan = await prisma.serverRepairPlan.findFirst({
    where: { id: repairPlanId, userId },
  })
  if (!plan) return { ok: false, status: 404, error: "Repair plan not found" }

  if (plan.status === "APPROVED" || plan.status === "QUEUED" || plan.status === "RUNNING") {
    return { ok: false, status: 409, error: "This repair plan is already approved or running." }
  }
  if (plan.status !== "APPROVAL_REQUIRED") {
    return { ok: false, status: 422, error: "This repair plan is not awaiting approval." }
  }

  const actions = Array.isArray(plan.actionsJson)
    ? (plan.actionsJson as ServerRepairAction[])
    : []
  const primary = primaryRepairAction(actions)
  if (!primary) {
    return { ok: false, status: 422, error: "No executable repair action is available." }
  }

  await prisma.serverRepairPlan.update({
    where: { id: plan.id },
    data: { status: "APPROVED" },
  })

  const queued = await enqueueServerRepair(plan.serverId, plan.id, primary.id)
  if (!queued.ok) {
    await prisma.serverRepairPlan.update({
      where: { id: plan.id },
      data: { status: "APPROVAL_REQUIRED" },
    })
    return { ok: false, status: 503, error: queued.error }
  }

  await prisma.serverRepairPlan.update({
    where: { id: plan.id },
    data: { status: "QUEUED" },
  })

  return { ok: true, repairPlanId: plan.id, repairActionId: primary.id }
}
