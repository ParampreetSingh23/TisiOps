import type { FinalStagingPlan } from "./staging-planning"

export type StagingSecretClass =
  | "GENERATED"
  | "DERIVED_FROM_STAGING_SERVICE"
  | "USER_REQUIRED"
  | "OPTIONAL"

export type StagingSecretPlan = {
  name: string
  class: StagingSecretClass
}

export type StagingDeploymentPayload = {
  stagingSessionId: string
  repositoryUrl: string
  stagingBranch: string
  appPort: number
  servicePath: string | null
  requiredEnvVars: string[]
  services: string[]
}

export function classifyStagingSecrets(names: string[]): StagingSecretPlan[] {
  return Array.from(new Set(names)).map((name) => {
    if (/^(JWT_SECRET|SESSION_SECRET|NEXTAUTH_SECRET)$/i.test(name)) {
      return { name, class: "GENERATED" }
    }
    if (/^DATABASE_URL$/i.test(name)) {
      return { name, class: "DERIVED_FROM_STAGING_SERVICE" }
    }
    if (/^REDIS_URL$/i.test(name)) {
      return { name, class: "DERIVED_FROM_STAGING_SERVICE" }
    }
    if (/^(NODE_ENV|PORT)$/i.test(name)) return { name, class: "OPTIONAL" }
    return { name, class: "USER_REQUIRED" }
  })
}

export function missingUserSecrets(names: string[]): string[] {
  return classifyStagingSecrets(names)
    .filter((secret) => secret.class === "USER_REQUIRED")
    .map((secret) => secret.name)
}

export function stagingPayloadFromPlan(
  stagingSessionId: string,
  plan: FinalStagingPlan
): StagingDeploymentPayload | null {
  if (plan.target !== "NEW_SERVER" || plan.provider !== "AWS") return null
  if (!plan.owner || !plan.repository || !plan.stagingBranch) return null

  return {
    stagingSessionId,
    repositoryUrl: `https://github.com/${plan.owner}/${plan.repository}.git`,
    stagingBranch: plan.stagingBranch,
    appPort: plan.appPort,
    servicePath: null,
    requiredEnvVars: plan.requiredEnvVars,
    services: plan.services,
  }
}

function safeShell(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`
}

export function buildStagingDeployScript(input: {
  deploymentId: string
  payload: StagingDeploymentPayload
}): string {
  const dir = `/opt/tisiops/staging/${input.deploymentId}`
  const project = `tisiops_staging_${input.deploymentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`
  const appPort = input.payload.appPort

  return `#!/bin/bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg git ufw

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

ufw default deny incoming
ufw default allow outgoing
ufw allow 80/tcp
ufw --force enable

rm -rf ${safeShell(dir)}
git clone --depth 1 --branch ${safeShell(input.payload.stagingBranch)} ${safeShell(input.payload.repositoryUrl)} ${safeShell(dir)}
cd ${safeShell(dir)}
${input.payload.servicePath ? `cd ${safeShell(input.payload.servicePath)}` : ""}

compose=""
for file in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
  if [ -f "$file" ]; then compose="$file"; break; fi
done
if [ -z "$compose" ]; then
  echo "UNSUPPORTED_STAGING_DEPLOYMENT: Docker Compose file not found"
  exit 42
fi

docker compose -p ${safeShell(project)} -f "$compose" up -d --build

cat > /etc/caddy/Caddyfile <<'TISIOPS_CADDY'
:80 {
  reverse_proxy 127.0.0.1:${appPort}
}
TISIOPS_CADDY

docker rm -f tisiops-staging-caddy >/dev/null 2>&1 || true
docker run -d --name tisiops-staging-caddy --restart unless-stopped \\
  --network host \\
  -v /etc/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \\
  caddy:2-alpine

docker compose -p ${safeShell(project)} -f "$compose" ps --status running
curl -fsS --max-time 15 http://127.0.0.1:${appPort}/ >/dev/null
curl -fsS --max-time 15 http://127.0.0.1/ >/dev/null
echo STAGING_READY
`
}
