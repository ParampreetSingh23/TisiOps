import assert from "node:assert/strict"

import {
  classifyIntent,
  isAccountMemoryQuestion,
  MISSING_REPAIR_TARGET_MESSAGE,
  repairTargetMessageWhenMissing,
} from "./orchestrator.agent"
import { isAiSystemLog } from "./logs.agent"
import {
  explainInspection,
  generateRetryPlan,
} from "../terraform/terraformAgentPlans"
import type { TerraformInspection } from "../terraform/terraformInspection"

assert.equal(classifyIntent("best places to visit in Delhi to eat"), "OUT_OF_SCOPE")
assert.equal(classifyIntent("Delhi is also a server platform"), "OUT_OF_SCOPE")
assert.equal(classifyIntent("show my deployments"), "LIST_DEPLOYMENTS")

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

console.log("agent routing checks passed")
