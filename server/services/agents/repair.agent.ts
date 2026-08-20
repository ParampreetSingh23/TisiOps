import type { RepairRiskLevel } from "../../db/generated/client"
import type { RepairAction, RepairDiagnosis, SpecialistEvidence } from "./agent.types"
import { hasAny } from "./agent-tools"

const READ_ONLY: RepairRiskLevel = "READ_ONLY"
const EXECUTION: RepairRiskLevel = "EXECUTION"

function action(
  id: string,
  label: string,
  risk: RepairRiskLevel,
  workerAction: RepairAction["workerAction"],
  implemented = true
): RepairAction {
  return {
    id,
    label,
    risk,
    requiresApproval: risk === "EXECUTION" || risk === "DESTRUCTIVE",
    workerAction,
    implemented,
  }
}

export async function runRepairAgent(evidence: SpecialistEvidence): Promise<RepairDiagnosis> {
  const detail = `${evidence.deployment.statusDetail ?? ""} ${evidence.logs.safeLogSummary}`
  const lower = detail.toLowerCase()

  let failurePoint = evidence.deployment.failureCode ?? "deployment"
  let lastSuccessfulStep = evidence.terraform.outputsAvailable ? "terraform.apply" : "unknown"
  let likelyCause = evidence.deployment.statusDetail ?? evidence.logs.safeLogSummary
  let recommendedFix = "Review logs, then retry the failed step."
  const actions: RepairAction[] = [
    action("rerun_health_check", "Run health check", READ_ONLY, "HEALTH_CHECK"),
  ]

  if (hasAny(lower, ["ssh", "timed out", "timeout", "port 22"])) {
    failurePoint = "ssh.connect"
    likelyCause =
      "TisiOps could not connect to the server over SSH after infrastructure was created."
    recommendedFix = "Check SSH reachability and re-apply infrastructure if the bootstrap never completed."
    actions.push(
      action("retry_ssh_connection", "Retry SSH bootstrap", EXECUTION, "REAPPLY_INFRA"),
      action("open_port_22_for_provisioning", "Open port 22 for provisioning", EXECUTION, null, false)
    )
  } else if (hasAny(lower, ["health", "not answer", "not opening", "listen", "port 80"])) {
    failurePoint = "health.check"
    lastSuccessfulStep = "container.start"
    likelyCause =
      "The deployment reached the final check, but the app did not answer on the expected address."
    recommendedFix = "Run a health check; if it still fails, re-apply the fixed infrastructure/bootstrap flow."
    actions.push(action("retry_failed_step", "Retry failed step", EXECUTION, "REAPPLY_INFRA"))
  } else if (evidence.deployment.type === "VERCEL") {
    failurePoint = evidence.deployment.failureCode ?? "vercel.build"
    lastSuccessfulStep = "repository.read"
    likelyCause =
      evidence.vercel.buildError ??
      "The Vercel deployment failed during build or project setup."
    recommendedFix = "Retry the Vercel deployment with the saved repository settings."
    actions.push(action("retry_deployment", "Retry deployment", EXECUTION, "REAPPLY_INFRA", false))
  } else {
    actions.push(action("retry_failed_step", "Retry failed step", EXECUTION, "REAPPLY_INFRA"))
  }

  const facts = [
    `Deployment status is ${evidence.deployment.status}.`,
    evidence.deployment.statusDetail,
    evidence.logs.errorLogs.at(-1)?.message,
    evidence.terraform.outputsAvailable ? "Terraform outputs are recorded." : null,
    evidence.aws.elasticIpAttached ? "Elastic IP is recorded." : null,
    evidence.logs.lastLog?.message ? `Latest log: ${evidence.logs.lastLog.message}` : null,
  ].filter((item): item is string => Boolean(item))

  const approvalRequired = actions.some((item) => item.requiresApproval && item.implemented)
  const riskLevel = approvalRequired ? EXECUTION : READ_ONLY

  return {
    type: "repair_diagnosis",
    deploymentId: evidence.deployment.id,
    status: evidence.deployment.status,
    failurePoint,
    lastSuccessfulStep,
    likelyCause,
    evidence: facts,
    recommendedFix,
    repairActions: actions,
    riskLevel,
    approvalRequired,
    retryRecommended: approvalRequired,
    userExplanation: `${likelyCause}\n\nRecommended action:\n${recommendedFix}`,
  }
}
