import { assertTemplatable, type BootstrapResult } from "./shared"

/**
 * Bootstrap for the general-purpose application server.
 *
 * Same contract as the n8n bootstrap: it returns a cloud-init script and never
 * runs a command itself. What differs is only what gets installed — Docker and
 * Caddy, with no application, because the application arrives later from a
 * repository.
 *
 * Deliberately does not accept a command to run. A bootstrap that took an
 * arbitrary script from a caller would be the arbitrary-shell-execution path
 * this architecture exists to prevent.
 */
export function buildAppServerBootstrap(input: {
  deploymentId: string
  appPort: number
  /** Hostname for the Caddy site block; plain HTTP on :80 without one. */
  domain: string | null
}): BootstrapResult {
  const deploymentId = assertTemplatable("deployment id", input.deploymentId)
  const site = input.domain ? assertTemplatable("domain", input.domain) : ":80"

  if (
    !Number.isInteger(input.appPort) ||
    input.appPort < 1 ||
    input.appPort > 65535
  ) {
    throw new Error("app port must be a valid port number")
  }

  const dir = `/opt/tisiops/app/${deploymentId}`

  return {
    script: `#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg ufw

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

ufw default deny incoming
ufw default allow outgoing
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

mkdir -p ${dir}
cd ${dir}

cat > Caddyfile <<'TISIOPS_CADDY'
${site} {
  reverse_proxy 127.0.0.1:${input.appPort}
}
TISIOPS_CADDY

docker run -d --name tisiops-caddy --restart unless-stopped \\
  --network host \\
  -v ${dir}/Caddyfile:/etc/caddy/Caddyfile:ro \\
  -v ${dir}/caddy_data:/data \\
  caddy:2-alpine
`,
  }
}
