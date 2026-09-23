import assert from "node:assert/strict"

import { capabilityForCopilotMessage, containerNameForCopilotMessage, SERVER_CAPABILITIES, isServerCapability } from "./copilot-capabilities"

assert.equal(SERVER_CAPABILITIES.SERVER_HEALTH.risk, "READ_ONLY")
assert.equal(SERVER_CAPABILITIES.INSTALL_DOCKER.risk, "EXECUTION")
assert.equal(SERVER_CAPABILITIES.INSTALL_APACHE.risk, "EXECUTION")
assert.equal(SERVER_CAPABILITIES.INSTALL_GIT.risk, "EXECUTION")
assert.equal(isServerCapability("rm -rf /"), false)
assert.equal(isServerCapability("DEPLOY_DOCKER_COMPOSE"), true)
assert.equal(capabilityForCopilotMessage("why is docker down?"), "LIST_CONTAINERS")
assert.equal(capabilityForCopilotMessage("install Docker"), "INSTALL_DOCKER")
assert.equal(capabilityForCopilotMessage("install apache2"), "INSTALL_APACHE")
assert.equal(capabilityForCopilotMessage("install git on this server"), "INSTALL_GIT")
assert.equal(containerNameForCopilotMessage("give me the logs of the worker container"), "worker")
assert.equal(containerNameForCopilotMessage("docker logs api-v2"), "api-v2")
assert.equal(containerNameForCopilotMessage("docker logs worker; rm -rf /"), null)
assert.equal(capabilityForCopilotMessage("run rm -rf /"), null)

console.log("server copilot capability checks passed")
