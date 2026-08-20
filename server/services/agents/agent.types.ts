import type { Deployment, RepairPlan, RepairRiskLevel } from "../../db/generated/client"

export type AgentIntent =
  | "REPAIR_DEPLOYMENT"
  | "DIAGNOSE_DEPLOYMENT"
  | "RETRY_DEPLOYMENT"
  | "CHECK_LOGS"
  | "CHECK_SERVER_HEALTH"
  | "GET_LAST_DEPLOYMENT"
  | "GET_LAST_SERVER"
  | "LIST_DEPLOYMENTS"
  | "LIST_SERVERS"
  | "GET_DEPLOYMENT_STATUS"
  | "GET_SERVER_STATUS"
  | "CHECK_AWS_INFRA"
  | "CHECK_TERRAFORM_STATE"
  | "CHECK_VERCEL_STATUS"
  | "CHECK_N8N_HEALTH"
  | "CHECK_REDIS_HEALTH"
  | "CHECK_POSTGRES_HEALTH"
  | "GENERAL_TISIOPS_HELP"
  | "OUT_OF_SCOPE"

export type AgentTraceEntry = {
  agentName: string
  summary: string
  createdAt: string
}

export type AgentContext = {
  activeDeploymentId: string | null
  activeServerId: string | null
  activeTemplateId: string | null
  activeProvider: string | null
  activeRepositoryOwner: string | null
  activeRepositoryName: string | null
  activeBranch: string | null
  activeServicePath: string | null
  latestDeploymentStatus: string | null
  latestFailedStep: string | null
  latestErrorCode: string | null
  latestTelemetrySummary: string | null
  latestLogsSummary: string | null
  latestRepairPlan: RepairDiagnosis | null
  agentTrace: AgentTraceEntry[]
}

export type LogsAgentResult = {
  recentLogs: { level: string; message: string; createdAt: string }[]
  errorLogs: { level: string; message: string; createdAt: string }[]
  lastLog: { level: string; message: string; createdAt: string } | null
  safeLogSummary: string
}

export type MonitoringAgentResult = {
  healthStatus: string
  httpStatus: number | null
  responseTimeMs: number | null
  lastHealthCheckAt: string | null
  containerStatus: string | null
}

export type TerraformAgentResult = {
  terraformStatus: string
  outputsAvailable: boolean
  instanceId: string | null
  elasticIp: string | null
  securityGroupId: string | null
}

export type AwsAgentResult = {
  ec2State: string | null
  elasticIpAttached: boolean
  securityGroupPorts: number[]
  instanceStatusChecks: string | null
}

export type ServerAgentResult = {
  sshReachable: boolean | null
  dockerInstalled: string | null
  caddyRunning: string | null
  diskUsage: string | null
  memoryUsage: string | null
}

export type VercelAgentResult = {
  vercelStatus: string | null
  buildError: string | null
  framework: string | null
}

export type SpecialistEvidence = {
  deployment: Pick<
    Deployment,
    | "id"
    | "type"
    | "provider"
    | "appName"
    | "repositoryOwner"
    | "repositoryName"
    | "branch"
    | "servicePath"
    | "status"
    | "statusDetail"
    | "failureCode"
    | "framework"
    | "publicUrl"
    | "previewUrl"
    | "template"
  >
  logs: LogsAgentResult
  monitoring: MonitoringAgentResult
  terraform: TerraformAgentResult
  aws: AwsAgentResult
  vercel: VercelAgentResult
  server: ServerAgentResult
  service: { name: string; status: string; summary: string }
  redis: { status: string; summary: string }
  postgres: { status: string; summary: string }
}

export type RepairAction = {
  id: string
  label: string
  risk: RepairRiskLevel
  requiresApproval: boolean
  workerAction: "HEALTH_CHECK" | "REAPPLY_INFRA" | null
  implemented: boolean
}

export type RepairDiagnosis = {
  type: "repair_diagnosis"
  deploymentId: string
  repairPlanId?: string
  status: string
  failurePoint: string
  lastSuccessfulStep: string
  likelyCause: string
  evidence: string[]
  recommendedFix: string
  repairActions: RepairAction[]
  riskLevel: RepairRiskLevel
  approvalRequired: boolean
  retryRecommended: boolean
  userExplanation: string
}

export type StoredRepairPlan = RepairPlan & {
  actionsJson: RepairAction[]
  evidenceJson: string[]
}
