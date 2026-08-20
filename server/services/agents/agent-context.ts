import { prisma } from "../../db/prisma"
import type { AgentContext, RepairDiagnosis } from "./agent.types"

export async function resolveAgentContext(input: {
  userId: string
  sessionId?: string | null
  deploymentId?: string | null
  allowLatestFallback?: boolean
}): Promise<AgentContext> {
  const session = input.sessionId
    ? await prisma.aiChatSession.findFirst({
        where: { id: input.sessionId, userId: input.userId },
      })
    : null

  const deploymentId =
    input.deploymentId ??
    session?.activeDeploymentId ??
    (input.allowLatestFallback
      ? (
          await prisma.deployment.findFirst({
            where: { userId: input.userId },
            orderBy: { updatedAt: "desc" },
            select: { id: true },
          })
        )?.id
      : null) ??
    null

  const deployment = deploymentId
    ? await prisma.deployment.findFirst({
        where: { id: deploymentId, userId: input.userId },
      })
    : null

  const latestRepairPlan = deployment
    ? await prisma.repairPlan.findFirst({
        where: { userId: input.userId, deploymentId: deployment.id },
        orderBy: { createdAt: "desc" },
      })
    : null

  return {
    activeDeploymentId: deployment?.id ?? null,
    activeServerId: null,
    activeTemplateId: deployment?.template ?? null,
    activeProvider: deployment?.provider ?? null,
    activeRepositoryOwner: deployment?.repositoryOwner ?? null,
    activeRepositoryName: deployment?.repositoryName ?? null,
    activeBranch: deployment?.branch ?? null,
    activeServicePath: deployment?.servicePath ?? null,
    latestDeploymentStatus: deployment?.status ?? null,
    latestFailedStep: session?.latestFailurePoint ?? null,
    latestErrorCode: deployment?.failureCode ?? null,
    latestTelemetrySummary: deployment?.statusDetail ?? null,
    latestLogsSummary: null,
    latestRepairPlan: latestRepairPlan
      ? ({
          type: "repair_diagnosis",
          deploymentId: latestRepairPlan.deploymentId,
          repairPlanId: latestRepairPlan.id,
          status: latestRepairPlan.status,
          failurePoint: latestRepairPlan.failurePoint ?? "unknown",
          lastSuccessfulStep: latestRepairPlan.lastSuccessfulStep ?? "unknown",
          likelyCause: latestRepairPlan.likelyCause,
          evidence: latestRepairPlan.evidenceJson as string[],
          recommendedFix: latestRepairPlan.recommendedFix,
          repairActions: latestRepairPlan.actionsJson as never,
          riskLevel: latestRepairPlan.riskLevel,
          approvalRequired: latestRepairPlan.approvalRequired,
          retryRecommended: latestRepairPlan.approvalRequired,
          userExplanation: latestRepairPlan.likelyCause,
        } satisfies RepairDiagnosis)
      : null,
    agentTrace: [],
  }
}
