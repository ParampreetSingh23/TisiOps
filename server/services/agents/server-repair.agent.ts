import { prisma } from "../../db/prisma"
import type { IssueType, HealthSummary, MonitoringContext } from "./monitoring-health"

/**
 * TisiOps Server Repair Agent (Phase 9, plan-only).
 *
 * Given a monitored issue it produces a deterministic, safe repair plan with
 * fixed backend-controlled action ids — never arbitrary commands, never
 * execution. The plan is stored and requires approval; only the worker may run
 * a fixed handler, and only after the user agrees. Non-implemented actions are
 * carried as `implemented: false` and resolved to PLANNED_NOT_IMPLEMENTED.
 */

export type ServerRepairAction = {
  id: string
  label: string
  risk: "READ_ONLY" | "PLANNING" | "EXECUTION" | "DESTRUCTIVE"
  requiresApproval: boolean
  implemented: boolean
}

export type ServerRepairPlanResult = {
  type: "repair_plan"
  repairPlanId: string | null
  serverId: string
  issueType: IssueType
  diagnosis: string
  evidence: string[]
  actions: ServerRepairAction[]
  approvalRequired: boolean
}

function action(
  id: string,
  label: string,
  risk: ServerRepairAction["risk"],
  implemented = true
): ServerRepairAction {
  return {
    id,
    label,
    risk,
    requiresApproval: risk === "EXECUTION" || risk === "DESTRUCTIVE",
    implemented,
  }
}

const DIAGNOSIS: Record<IssueType, string> = {
  HIGH_CPU: "CPU usage is critically high on the server.",
  HIGH_MEMORY: "Memory usage is critically high on the server.",
  DISK_PRESSURE: "Disk usage is critically high on the server.",
  DOCKER_STOPPED: "Docker is not running on the server.",
  CONTAINER_UNHEALTHY: "One or more containers are unhealthy on the server.",
  CONTAINER_RESTARTING: "A container is restarting on the server.",
  HEALTHCHECK_FAILED: "A health check has failed on the server.",
  MONITORING_STALE: "Monitoring data is stale on the server.",
  SERVER_UNREACHABLE: "The server could not be reached for monitoring.",
  NONE: "No repair is needed.",
}

const IMPLEMENTED_ACTIONS: ServerRepairAction[] = [
  action("restart_docker", "Restart Docker", "EXECUTION"),
  action("rerun_healthcheck", "Retry health check", "EXECUTION"),
  action("retry_monitoring_collection", "Retry monitoring collection", "EXECUTION"),
]

const PLANNED_ONLY_ACTIONS: ServerRepairAction[] = [
  action("restart_container", "Restart affected container", "EXECUTION", false),
  action("clear_safe_logs", "Clear safe logs", "DESTRUCTIVE", false),
  action("clear_safe_cache", "Clear safe cache", "DESTRUCTIVE", false),
  action("upgrade_server", "Upgrade server packages", "EXECUTION", false),
]

function actionsFor(issueType: IssueType): ServerRepairAction[] {
  switch (issueType) {
    case "DOCKER_STOPPED":
      return [IMPLEMENTED_ACTIONS[0], IMPLEMENTED_ACTIONS[1]]
    case "MONITORING_STALE":
      return [IMPLEMENTED_ACTIONS[2]]
    case "CONTAINER_UNHEALTHY":
    case "CONTAINER_RESTARTING":
      return [PLANNED_ONLY_ACTIONS[0], IMPLEMENTED_ACTIONS[1], IMPLEMENTED_ACTIONS[2]]
    case "HEALTHCHECK_FAILED":
      return [IMPLEMENTED_ACTIONS[1]]
    case "SERVER_UNREACHABLE":
      return [IMPLEMENTED_ACTIONS[1], IMPLEMENTED_ACTIONS[2]]
    case "HIGH_CPU":
    case "HIGH_MEMORY":
    case "DISK_PRESSURE":
      return [IMPLEMENTED_ACTIONS[1], IMPLEMENTED_ACTIONS[2]]
    default:
      return []
  }
}

/** The action approval should queue: the first implemented execution/destructive one. */
export function primaryRepairAction(actions: ServerRepairAction[]): ServerRepairAction | null {
  return (
    actions.find((item) => item.implemented && item.requiresApproval) ?? null
  )
}

export async function planServerRepair(input: {
  userId: string
  serverId: string
  issueType: IssueType
  ctx: MonitoringContext | null
  summary: HealthSummary | null
  recentLogs: { level: string; message: string; createdAt: string }[]
}): Promise<ServerRepairPlanResult | null> {
  const issueType = input.issueType
  const diagnosis = DIAGNOSIS[issueType] ?? DIAGNOSIS.NONE
  const actions = actionsFor(issueType)
  const approvalRequired = actions.some((item) => item.requiresApproval && item.implemented)

  const evidence = [
    ...(input.summary?.evidence ?? []),
    ...input.recentLogs.map((log) => `${log.level}: ${log.message}`),
  ].slice(0, 12)

  const riskLevel = actions.some((item) => item.risk === "DESTRUCTIVE")
    ? "DESTRUCTIVE"
    : actions.some((item) => item.risk === "EXECUTION")
      ? "EXECUTION"
      : "READ_ONLY"

  const created = await prisma.serverRepairPlan.create({
    data: {
      userId: input.userId,
      serverId: input.serverId,
      issueType,
      diagnosis,
      evidenceJson: evidence as never,
      actionsJson: actions as never,
      riskLevel,
      approvalRequired,
      status: approvalRequired ? "APPROVAL_REQUIRED" : "DRAFT",
    },
  })

  return {
    type: "repair_plan",
    repairPlanId: created.id,
    serverId: input.serverId,
    issueType,
    diagnosis,
    evidence,
    actions,
    approvalRequired,
  }
}
