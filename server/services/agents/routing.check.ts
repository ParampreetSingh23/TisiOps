import assert from "node:assert/strict"

import {
  agentNameForIntent,
  classifyIntent,
  isAccountMemoryQuestion,
  isServerMonitoringIntent,
  MISSING_REPAIR_TARGET_MESSAGE,
  repairTargetMessageWhenMissing,
} from "./orchestrator.agent"
import { runServerMonitoringAgent } from "./server-monitoring.agent"
import { selectServerMessage } from "./server-orchestrator.agent"
import { isAiSystemLog } from "./logs.agent"
import { detectIntent } from "../github/intent"
import { sanitizeReply } from "../ai/reply"
import {
  explainInspection,
  generateRetryPlan,
} from "../terraform/terraformAgentPlans"
import type { TerraformInspection } from "../terraform/terraformInspection"

assert.equal(classifyIntent("best places to visit in Delhi to eat"), "OUT_OF_SCOPE")
assert.equal(classifyIntent("Delhi is also a server platform"), "OUT_OF_SCOPE")
assert.equal(classifyIntent("show my deployments"), "LIST_DEPLOYMENTS")

assert.equal(classifyIntent("CHECK MONITORING OF MY SERVER"), "CHECK_MONITORING_STATUS")
assert.equal(isServerMonitoringIntent(classifyIntent("CHECK MONITORING OF MY SERVER")), true)
assert.equal(classifyIntent("WHAT IS CPU LOAD"), "CHECK_CPU_USAGE")
assert.equal(isServerMonitoringIntent(classifyIntent("WHAT IS CPU LOAD")), true)
assert.equal(classifyIntent("what about cpu?"), "CHECK_CPU_USAGE")
assert.equal(isServerMonitoringIntent(classifyIntent("what about cpu?")), true)

assert.equal(classifyIntent("what is my name"), "GENERAL_TISIOPS_HELP")
assert.equal(isAccountMemoryQuestion("what is my name"), true)

assert.equal(classifyIntent("what is the last server i deployed"), "GET_LAST_SERVER")
assert.equal(classifyIntent("what was the last tisiops server i deployed"), "GET_LAST_SERVER")
assert.equal(classifyIntent("what was the last tisops server i deployed"), "GET_LAST_SERVER")
assert.equal(classifyIntent("show my latest deployment"), "GET_LAST_DEPLOYMENT")
assert.equal(classifyIntent("which server did i create last"), "GET_LAST_SERVER")
assert.equal(classifyIntent("what was my last n8n deployment"), "GET_LAST_DEPLOYMENT")
assert.equal(classifyIntent("show my servers"), "LIST_SERVERS")
assert.equal(classifyIntent("show my deployments"), "LIST_DEPLOYMENTS")
assert.equal(classifyIntent("which server stopped"), "GET_SERVER_STATUS")
assert.equal(classifyIntent("why did my n8n deployment fail"), "DIAGNOSE_DEPLOYMENT")
assert.equal(classifyIntent("can i deploy a staging server on tisiops"), "CREATE_STAGING")
assert.equal(agentNameForIntent(classifyIntent("can i deploy a staging server on tisiops")), "StagingAgent")
assert.equal(classifyIntent("create staging for this server"), "CREATE_STAGING")
assert.equal(agentNameForIntent(classifyIntent("create staging for this server")), "StagingAgent")
assert.equal(classifyIntent("deploy a staging server"), "CREATE_STAGING")
assert.equal(classifyIntent("build staging"), "CREATE_STAGING")
assert.equal(classifyIntent("staging environment"), "CREATE_STAGING")
assert.equal(classifyIntent("make staging from production"), "CREATE_STAGING")
assert.equal(classifyIntent("clone production to staging"), "CREATE_STAGING")
assert.equal(classifyIntent("setup staging"), "CREATE_STAGING")
assert.equal(classifyIntent("what is the status of my n8n deployment?"), "GET_DEPLOYMENT_STATUS")
assert.equal(agentNameForIntent(classifyIntent("what is the status of my n8n deployment?")), "DeploymentAgent")
assert.equal(classifyIntent("show terraform plan for this deployment"), "CHECK_TERRAFORM_STATE")
assert.equal(detectIntent("show terraform plan for this deployment"), "terraform_agent")
assert.equal(agentNameForIntent(classifyIntent("show terraform plan for this deployment")), "TerraformAgent")

assert.equal(classifyIntent("fix it"), "REPAIR_DEPLOYMENT")
assert.equal(repairTargetMessageWhenMissing("fix it"), MISSING_REPAIR_TARGET_MESSAGE)

assert.equal(isAiSystemLog("AI repair diagnosis started"), true)
assert.equal(isAiSystemLog("Repair Agent identified failure point"), true)
assert.equal(isAiSystemLog("Container failed health check"), false)

const inspection: TerraformInspection = {
  deploymentId: "dep_123",
  template: "aws-n8n-server",
  region: "ap-south-1",
  status: "FAILED",
  statusDetail: "health check failed",
  planSummary: null,
  outputs: null,
  state: {
    key: "terraform/aws-n8n-server/dep_123/terraform.tfstate",
    backend: "s3",
    hasRecordedOutputs: false,
    workingDirectory: "/Users/pampi/Workstation/TisiOps/server/infra/terraform/deployments/dep_123",
  },
  server: null,
  lastJob: null,
  diagnosis: null,
  canRetry: true,
  canDestroy: false,
}

const userFacing = [explainInspection(inspection), ...generateRetryPlan(inspection).steps].join("\n")
assert.equal(userFacing.includes("terraform/aws-n8n-server/dep_123/terraform.tfstate"), false)
assert.equal(userFacing.includes("/Users/pampi/Workstation"), false)

const now = new Date().toISOString()
const activeNoSnapshot = await runServerMonitoringAgent({
  userId: "user_1",
  serverId: "srv_1",
  question: "check monitoring of my server",
  isAdmin: false,
  context: {
    serverId: "srv_1",
    serverName: "prod",
    monitoringStatus: "ACTIVE",
    freshness: "UNAVAILABLE",
    metrics: { cpuPercent: null, memoryPercent: null, diskPercent: null },
    docker: { status: null, containerCount: 0, unhealthyContainers: 0 },
    lastHeartbeatAt: null,
    lastCheckedAt: null,
    collectedAt: null,
    healthChecks: [],
    recentLogs: [],
  },
})
assert.equal(activeNoSnapshot.ok, true)
assert.match(
  activeNoSnapshot.ok ? activeNoSnapshot.answer.answer : "",
  /Monitoring is active, but no metric snapshot has been collected yet\./
)
assert.doesNotMatch(activeNoSnapshot.ok ? activeNoSnapshot.answer.answer : "", /CPU.*0%|Terraform/i)

const cpuAnswer = await runServerMonitoringAgent({
  userId: "user_1",
  serverId: "srv_1",
  question: "what is cpu load",
  isAdmin: false,
  context: {
    serverId: "srv_1",
    serverName: "prod",
    monitoringStatus: "ACTIVE",
    freshness: "FRESH",
    metrics: { cpuPercent: 73, memoryPercent: 61, diskPercent: 48 },
    docker: { status: "RUNNING", containerCount: 5, unhealthyContainers: 0 },
    lastHeartbeatAt: now,
    lastCheckedAt: now,
    collectedAt: now,
    healthChecks: [],
    recentLogs: [],
  },
})
assert.equal(cpuAnswer.ok, true)
assert.match(cpuAnswer.ok ? cpuAnswer.answer.answer : "", /CPU usage: 73%/)
assert.equal(cpuAnswer.ok ? cpuAnswer.answer.intent : null, "CHECK_CPU_USAGE")

const staleCpuAnswer = await runServerMonitoringAgent({
  userId: "user_1",
  serverId: "srv_1",
  question: "what is cpu load",
  isAdmin: false,
  context: {
    serverId: "srv_1",
    serverName: "prod",
    monitoringStatus: "ACTIVE",
    freshness: "STALE",
    metrics: { cpuPercent: 73, memoryPercent: 61, diskPercent: 48 },
    docker: { status: "RUNNING", containerCount: 5, unhealthyContainers: 0 },
    lastHeartbeatAt: now,
    lastCheckedAt: now,
    collectedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    healthChecks: [],
    recentLogs: [],
  },
})
assert.equal(staleCpuAnswer.ok, true)
assert.match(staleCpuAnswer.ok ? staleCpuAnswer.answer.answer : "", /stale|Last known/i)
assert.equal(sanitizeReply("svg\n\nAssistant message").includes("svg"), false)
assert.equal(selectServerMessage(), "Which server would you like me to check?")

console.log("agent routing checks passed")
