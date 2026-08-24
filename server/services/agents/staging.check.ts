import assert from "node:assert/strict"

import { classifyIntent } from "./orchestrator.agent"
import {
  isStagingIntent,
  resolveStagingSourceServer,
  stagingSourceTypeFromText,
  stagingIntentFromText,
  stagingStatusForIntent,
  validateFinalStagingPlanReadiness,
} from "./staging.agent"

// Intent detection (pure).
assert.equal(stagingIntentFromText("create staging for this server"), "CREATE_STAGING")
assert.equal(stagingIntentFromText("create a staging from this production server"), "CREATE_STAGING")
assert.equal(stagingIntentFromText("prepare a staging copy of prod"), "CREATE_STAGING")
assert.equal(stagingIntentFromText("analyse production for staging"), "ANALYSE_PRODUCTION_FOR_STAGING")
assert.equal(stagingIntentFromText("analyze production for staging"), "ANALYSE_PRODUCTION_FOR_STAGING")
assert.equal(stagingIntentFromText("get staging plan"), "GET_STAGING_PLAN")
assert.equal(stagingIntentFromText("what is the staging plan"), "GET_STAGING_PLAN")
assert.equal(stagingIntentFromText("select staging target"), "SELECT_STAGING_TARGET")
assert.equal(stagingIntentFromText("where should staging run"), "SELECT_STAGING_TARGET")
assert.equal(stagingIntentFromText("use an existing server"), "SELECT_STAGING_TARGET")
assert.equal(stagingIntentFromText("create a new server"), "SELECT_STAGING_TARGET")
assert.equal(stagingIntentFromText("get staging status"), "GET_STAGING_STATUS")
assert.equal(stagingIntentFromText("production blueprint"), "GET_PRODUCTION_BLUEPRINT")
assert.equal(stagingIntentFromText("build a blueprint for production"), "GET_PRODUCTION_BLUEPRINT")
assert.equal(stagingIntentFromText("generate a staging blueprint"), "GENERATE_STAGING_BLUEPRINT")
assert.equal(stagingIntentFromText("what does staging need"), "GENERATE_STAGING_BLUEPRINT")
assert.equal(stagingIntentFromText("approve staging"), "APPROVE_STAGING")
assert.equal(stagingIntentFromText("create staging for this server"), "CREATE_STAGING")
assert.equal(stagingIntentFromText("can i deploy a staging server on tisiops"), "CREATE_STAGING")
assert.equal(stagingIntentFromText("make a staging branch and deploy it"), "CREATE_STAGING")
assert.equal(stagingIntentFromText("what is the weather in delhi"), null)
assert.equal(stagingSourceTypeFromText("Existing Server"), "STAGING_SOURCE_SERVER")
assert.equal(stagingSourceTypeFromText("GitHub Repository"), "STAGING_SOURCE_REPOSITORY")

// classifyIntent routes staging before the generic devops fallback.
assert.equal(classifyIntent("create staging for this server"), "CREATE_STAGING")
assert.equal(classifyIntent("analyse production for staging"), "ANALYSE_PRODUCTION_FOR_STAGING")
assert.equal(classifyIntent("get staging plan"), "GET_STAGING_PLAN")
assert.equal(classifyIntent("get staging status"), "GET_STAGING_STATUS")
assert.equal(classifyIntent("show the production blueprint"), "GET_PRODUCTION_BLUEPRINT")
assert.equal(classifyIntent("generate a staging blueprint"), "GENERATE_STAGING_BLUEPRINT")
assert.equal(classifyIntent("where should staging run"), "SELECT_STAGING_TARGET")
assert.equal(classifyIntent("approve staging"), "APPROVE_STAGING")

// Status lifecycle mapping (pure).
assert.equal(isStagingIntent("CREATE_STAGING"), true)
assert.equal(isStagingIntent("CHECK_LOGS"), false)
assert.equal(stagingStatusForIntent("CREATE_STAGING"), "CREATED")
assert.equal(stagingStatusForIntent("ANALYSE_PRODUCTION_FOR_STAGING"), "ANALYSING")
assert.equal(stagingStatusForIntent("SELECT_STAGING_TARGET"), "READY")
assert.equal(stagingStatusForIntent("GET_STAGING_PLAN"), null)
assert.equal(stagingStatusForIntent("GET_PRODUCTION_BLUEPRINT"), null)
assert.equal(isStagingIntent("GENERATE_STAGING_BLUEPRINT"), true)
assert.equal(stagingStatusForIntent("GENERATE_STAGING_BLUEPRINT"), null)
assert.equal(isStagingIntent("APPROVE_STAGING"), true)
assert.equal(stagingStatusForIntent("APPROVE_STAGING"), "READY")

const oneServer = [{ id: "srv_1", name: "Ubuntu Server" }]
const threeServers = [
  { id: "srv_1", name: "Ubuntu Server" },
  { id: "srv_2", name: "API Server" },
  { id: "srv_3", name: "Worker Server" },
]

const named = resolveStagingSourceServer("Ubuntu Server", threeServers)
assert.equal(named.status, "selected")
assert.equal(named.status === "selected" ? named.server.id : null, "srv_1")

const only = resolveStagingSourceServer("the only server I have", oneServer)
assert.equal(only.status, "selected")
assert.equal(only.status === "selected" ? only.reason : null, "only")

assert.equal(resolveStagingSourceServer("can i deploy a staging server on tisiops", oneServer).status, "not_server")
assert.equal(resolveStagingSourceServer("use my only server", oneServer).status, "selected")
assert.equal(resolveStagingSourceServer("my server", threeServers).status, "ambiguous")
assert.equal(resolveStagingSourceServer("what is the weather?", oneServer).status, "not_server")

assert.equal(
  validateFinalStagingPlanReadiness({
    sourceType: "STAGING_SOURCE_SERVER",
    sourceServerId: "srv_1",
    sourceRepositoryId: null,
    sourceBranch: null,
    runtimeJson: null,
    codeProfileJson: null,
    stagingJson: null,
    target: "NEW_SERVER",
    discoveryError: "Could not reach Redis Cloud.",
  }),
  "PLAN_NOT_READY: production discovery failed."
)

assert.equal(
  validateFinalStagingPlanReadiness({
    sourceType: "STAGING_SOURCE_REPOSITORY",
    sourceServerId: null,
    sourceRepositoryId: "acme/app",
    sourceBranch: "main",
    runtimeJson: null,
    codeProfileJson: null,
    stagingJson: {},
    target: "NEW_SERVER",
    discoveryError: null,
  }),
  "PLAN_NOT_READY: code deployment profile missing."
)

console.log("staging checks passed")
