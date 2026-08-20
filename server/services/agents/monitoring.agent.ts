import type { Deployment } from "../../db/generated/client"
import type { MonitoringAgentResult } from "./agent.types"

export async function runMonitoringAgent(
  deployment: Pick<Deployment, "status" | "updatedAt">
): Promise<MonitoringAgentResult> {
  return {
    healthStatus:
      deployment.status === "LIVE"
        ? "HEALTHY"
        : deployment.status === "FAILED"
          ? "FAILED"
          : "UNKNOWN",
    httpStatus: null,
    responseTimeMs: null,
    lastHealthCheckAt: deployment.updatedAt.toISOString(),
    containerStatus: null,
  }
}
