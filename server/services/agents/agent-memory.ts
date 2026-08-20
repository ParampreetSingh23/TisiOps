import { prisma } from "../../db/prisma"
import type { RepairDiagnosis } from "./agent.types"

export async function rememberRepair(input: {
  userId: string
  sessionId?: string | null
  diagnosis: RepairDiagnosis
}): Promise<void> {
  if (!input.sessionId) return

  const action = input.diagnosis.repairActions.find((item) => item.requiresApproval)

  await prisma.aiChatSession.updateMany({
    where: { id: input.sessionId, userId: input.userId },
    data: {
      activeDeploymentId: input.diagnosis.deploymentId,
      latestRepairPlanId: input.diagnosis.repairPlanId ?? null,
      latestFailurePoint: input.diagnosis.failurePoint,
      latestRecommendedAction: action?.id ?? null,
    },
  })
}

export async function pendingRepairForSession(userId: string, sessionId: string) {
  const session = await prisma.aiChatSession.findFirst({
    where: { id: sessionId, userId },
    select: { latestRepairPlanId: true, latestRecommendedAction: true },
  })

  if (!session?.latestRepairPlanId) return null

  return {
    repairPlanId: session.latestRepairPlanId,
    repairActionId: session.latestRecommendedAction,
  }
}
