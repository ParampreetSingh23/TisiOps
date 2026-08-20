import assert from "node:assert/strict"

import { runRepairAgent } from "./repair.agent"
import type { SpecialistEvidence } from "./agent.types"

const base: SpecialistEvidence = {
  deployment: {
    id: "dep_test",
    type: "N8N",
    provider: "TISIOPS_MANAGED_AWS",
    appName: "test",
    repositoryOwner: "",
    repositoryName: "",
    branch: "",
    servicePath: null,
    status: "FAILED",
    statusDetail: "SSH connection timed out",
    failureCode: null,
    framework: null,
    publicUrl: null,
    previewUrl: null,
    template: "aws-n8n-server",
  },
  logs: {
    recentLogs: [],
    errorLogs: [{ level: "ERROR", message: "SSH connection timed out", createdAt: new Date(0).toISOString() }],
    lastLog: { level: "ERROR", message: "SSH connection timed out", createdAt: new Date(0).toISOString() },
    safeLogSummary: "SSH connection timed out",
  },
  monitoring: {
    healthStatus: "FAILED",
    httpStatus: null,
    responseTimeMs: null,
    lastHealthCheckAt: null,
    containerStatus: null,
  },
  terraform: {
    terraformStatus: "SUCCEEDED",
    outputsAvailable: true,
    instanceId: "i-test",
    elasticIp: "203.0.113.1",
    securityGroupId: "sg-test",
  },
  aws: {
    ec2State: "unknown",
    elasticIpAttached: true,
    securityGroupPorts: [],
    instanceStatusChecks: "unknown",
  },
  server: {
    sshReachable: false,
    dockerInstalled: null,
    caddyRunning: null,
    diskUsage: null,
    memoryUsage: null,
  },
  vercel: { vercelStatus: null, buildError: null, framework: null },
  service: { name: "n8n", status: "FAILED", summary: "n8n context" },
  redis: { status: "planned", summary: "planned" },
  postgres: { status: "not_applicable", summary: "not app" },
}

const ssh = await runRepairAgent(base)
assert.equal(ssh.failurePoint, "ssh.connect")
assert.equal(ssh.approvalRequired, true)
assert.equal(ssh.repairActions.some((action) => action.workerAction === "REAPPLY_INFRA"), true)

const health = await runRepairAgent({
  ...base,
  deployment: {
    ...base.deployment,
    statusDetail: "The deployment did not answer its health check.",
  },
  logs: { ...base.logs, safeLogSummary: "health check failed" },
})

assert.equal(health.failurePoint, "health.check")
assert.equal(health.repairActions.some((action) => action.workerAction === "HEALTH_CHECK"), true)

console.log("agent checks passed")
