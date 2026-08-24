import assert from "node:assert/strict"

import { parseProductionRuntime } from "./production-runtime-parse"
import { gitRepoFromRemote, majorVersion } from "./production-runtime-parse"

const OUTPUT = [
  "<<<OS>>> Ubuntu 24.04.1 LTS",
  "<<<CPU>>> 4",
  "<<<RAM_MB>>> 8192",
  "<<<DISK_GB>>> 40",
  "<<<DOCKER>>> Running|27.0.0",
  "<<<COMPOSE>>> api,frontend",
  "<<<CONTAINERS>>> api-prod|nginx:latest|Up 2 hours|0.0.0.0:3000->3000/tcp",
  "<<<CONTAINERS>>> postgres-prod|postgres:16|Up 2 hours|5432/tcp",
  "<<<IMAGES>>> nginx:latest",
  "<<<IMAGES>>> postgres:16",
  "<<<VOLUMES>>> api_data",
  "<<<NETWORKS>>> api_net",
  "<<<RUNTIMES>>> node|22.12.0",
  "<<<RUNTIMES>>> python|3.11.8",
  "<<<SERVICES>>> nginx.service|active",
  "<<<SERVICES>>> caddy.service|active",
  "<<<PG>>> running",
  "<<<REDIS>>> running",
  "<<<NGINX>>> active",
  "<<<CADDY>>> active",
  "<<<DOMAINS>>> api.company.com",
  "<<<GIT_REPO>>> /var/www/api",
  "<<<GIT_BRANCH>>> main",
  "<<<GIT_COMMIT>>> abc1234",
  "<<<GIT_REMOTE>>> git@github.com:company/api.git",
].join("\n")

const runtime = parseProductionRuntime(OUTPUT)

assert.equal(runtime.os, "Ubuntu 24.04.1 LTS")
assert.equal(runtime.cpuCount, 4)
assert.equal(runtime.memoryMb, 8192)
assert.equal(runtime.diskGb, 40)
assert.deepEqual(runtime.docker, { status: "Running", version: "27.0.0" })
assert.deepEqual(runtime.composeProjects, ["api", "frontend"])
assert.deepEqual(runtime.containers, [
  { name: "api-prod", image: "nginx:latest", status: "Up 2 hours", ports: "0.0.0.0:3000->3000/tcp" },
  { name: "postgres-prod", image: "postgres:16", status: "Up 2 hours", ports: "5432/tcp" },
])
assert.deepEqual(runtime.images, ["nginx:latest", "postgres:16"])
assert.deepEqual(runtime.volumes, ["api_data"])
assert.deepEqual(runtime.networks, ["api_net"])
assert.deepEqual(runtime.runtimes, [
  { name: "node", version: "22.12.0" },
  { name: "python", version: "3.11.8" },
])
assert.deepEqual(runtime.systemdServices, [
  { unit: "nginx.service", state: "active" },
  { unit: "caddy.service", state: "active" },
])
assert.equal(runtime.postgres, "running")
assert.equal(runtime.redis, "running")
assert.equal(runtime.nginx, "active")
assert.equal(runtime.caddy, "active")
assert.deepEqual(runtime.domains, ["api.company.com"])
assert.deepEqual(runtime.git, {
  repoPath: "/var/www/api",
  branch: "main",
  commit: "abc1234",
  remote: "git@github.com:company/api.git",
})

// Git remote → repo identity.
assert.deepEqual(gitRepoFromRemote("git@github.com:company/api.git"), {
  owner: "company",
  name: "api",
})
assert.deepEqual(gitRepoFromRemote("https://github.com/company/api.git"), {
  owner: "company",
  name: "api",
})
assert.deepEqual(gitRepoFromRemote("https://github.com/company/api"), {
  owner: "company",
  name: "api",
})
assert.equal(gitRepoFromRemote("https://example.com/not-repo"), null)
assert.equal(gitRepoFromRemote(null), null)

assert.equal(majorVersion("20.11.1"), "20")
assert.equal(majorVersion("v22.12.0"), "22")
assert.equal(majorVersion(null), null)

// A server with no Docker, no repo: every list is empty and every scalar "down"/null.
const bare = parseProductionRuntime(
  [
    "<<<OS>>> Debian GNU/Linux 12",
    "<<<CPU>>> 2",
    "<<<RAM_MB>>> 4096",
    "<<<DISK_GB>>> 20",
    "<<<DOCKER>>> Not running",
    "<<<COMPOSE>>> ",
    "<<<PG>>> down",
    "<<<REDIS>>> down",
    "<<<NGINX>>> unavailable",
    "<<<CADDY>>> unavailable",
    "<<<GIT_REPO>>> ",
  ].join("\n")
)
assert.equal(bare.os, "Debian GNU/Linux 12")
assert.equal(bare.cpuCount, 2)
assert.deepEqual(bare.docker, { status: "Not running", version: null })
assert.deepEqual(bare.containers, [])
assert.deepEqual(bare.domains, [])
assert.equal(bare.git.repoPath, null)
assert.equal(bare.postgres, "down")

console.log("production-runtime checks passed")
