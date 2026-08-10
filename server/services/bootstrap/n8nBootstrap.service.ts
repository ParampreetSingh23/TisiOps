import { randomBytes } from "node:crypto"

import type { N8nConfig } from "../n8n/plans"
import { assertTemplatable } from "./shared"

/**
 * The n8n server bootstrap, run by the worker over SSH.
 *
 * Split into named steps rather than one script, because each one is a line in
 * the deployment log and a place a failure can be reported precisely. Terraform
 * creates the machine; everything installed on it happens here.
 *
 * Nothing in this file executes anything. Each function returns a script, and
 * services/bootstrap/ssh.ts runs it — which is what keeps "configure the
 * server" from becoming a way to run arbitrary commands on it.
 */

export type N8nSecrets = {
  encryptionKey: string
  dbPassword: string
}

/** URL-safe, no shell-quoting hazards, ~192 bits. */
export function generateSecret(): string {
  return randomBytes(24).toString("base64url")
}

export function generateSecrets(): N8nSecrets {
  return { encryptionKey: generateSecret(), dbPassword: generateSecret() }
}

/** Where n8n answers, once the deployment is live. */
export function publicUrlFor(config: N8nConfig, elasticIp: string): string {
  return config.domain ? `https://${config.domain}` : `http://${elasticIp}`
}

export type BootstrapFiles = {
  env: string
  compose: string
  caddyfile: string
}

/** Where this deployment's stack lives on the server. */
export function deploymentDir(deploymentId: string): string {
  return `/opt/tisiops/n8n/${assertTemplatable("deployment id", deploymentId)}`
}

/**
 * Caddy site address. A hostname makes Caddy request a certificate on its own;
 * `:80` is the only honest option without one, because no certificate authority
 * will issue for a bare IP.
 */
function siteAddress(config: N8nConfig): string {
  return config.domain ?? ":80"
}

/** The three files the stack is made of. Secrets live only in `env`. */
export function buildFiles(input: {
  deploymentId: string
  config: N8nConfig
  secrets: N8nSecrets
  /** The server's public address, used when no domain was chosen. */
  elasticIp?: string
}): BootstrapFiles {
  const { config, secrets } = input

  // Without a domain the address IS the Elastic IP. "localhost" would resolve
  // to the container itself, which makes every webhook n8n registers point at
  // nothing — the failure is silent, because the workflow saves fine.
  const host = config.domain ?? input.elasticIp ?? "localhost"
  const protocol = config.domain ? "https" : "http"
  const timezone = assertTemplatable("timezone", config.timezone)
  const site = assertTemplatable("domain", siteAddress(config))
  const email = assertTemplatable("admin email", config.adminEmail)

  assertTemplatable("encryption key", secrets.encryptionKey)
  assertTemplatable("database password", secrets.dbPassword)

  // WEBHOOK_URL has to be the address the outside world uses, not the
  // container's own. n8n bakes it into every webhook it registers, so a wrong
  // value here produces workflows that silently never fire.
  const webhookUrl = `${protocol}://${host}/`

  // n8n refuses to set its session cookie over plain HTTP, which makes the
  // sign-in page unusable on a bare IP. Turned off only when there is no
  // domain and therefore no certificate; with a domain the cookie stays
  // secure, which is the reason to use one.
  const secureCookie = config.domain
    ? "N8N_SECURE_COOKIE=true"
    : "N8N_SECURE_COOKIE=false"

  return {
    env: `N8N_HOST=${host}
N8N_PORT=5678
N8N_PROTOCOL=${protocol}
WEBHOOK_URL=${webhookUrl}
N8N_EDITOR_BASE_URL=${webhookUrl}
N8N_ENCRYPTION_KEY=${secrets.encryptionKey}
GENERIC_TIMEZONE=${timezone}
TZ=${timezone}
N8N_DIAGNOSTICS_ENABLED=false
N8N_RUNNERS_ENABLED=true
${secureCookie}
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=postgres
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=n8n
DB_POSTGRESDB_USER=n8n
DB_POSTGRESDB_PASSWORD=${secrets.dbPassword}
POSTGRES_PASSWORD=${secrets.dbPassword}
TISIOPS_ADMIN_EMAIL=${email}
`,
    caddyfile: `${site} {
  reverse_proxy n8n:5678
}
`,
    compose: `services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: n8n
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - ./postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U n8n -d n8n"]
      interval: 5s
      timeout: 5s
      retries: 30
    # Capped so Postgres cannot take the whole box on a 1 GB instance and get
    # n8n killed by the kernel instead.
    mem_limit: 256m

  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    restart: unless-stopped
    # Started only once Postgres answers, so the first boot does not fail its
    # migrations against a database that is not listening yet.
    depends_on:
      postgres:
        condition: service_healthy
    env_file: .env
    volumes:
      - ./n8n_data:/home/node/.n8n
    # Deliberately not published to the host: Caddy is the only way in.
    expose:
      - "5678"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - n8n
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./caddy_data:/data
    mem_limit: 128m
`,
  }
}

/**
 * First boot, as cloud-init.
 *
 * Deliberately tiny: it adds swap and nothing else. The worker installs and
 * configures everything over SSH, where each step's output can be read and
 * reported. Swap is here rather than there because it has to exist before
 * anything memory-hungry runs.
 *
 * A t3.micro has 1 GB of RAM, and Postgres, n8n, and Caddy together do not fit
 * in it. Without swap the kernel kills n8n and Caddy answers 502 forever.
 */
export function buildCloudInit(): string {
  return `#!/bin/bash
set -euxo pipefail

if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
`
}

/** Step 1: Docker Engine and the Compose plugin. */
export function buildDockerInstall(): string {
  return `#!/bin/bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "docker already installed"
  exit 0
fi

# Waits out cloud-init and any unattended-upgrade holding the dpkg lock, which
# is the most common reason a first-boot install fails.
cloud-init status --wait >/dev/null 2>&1 || true
for i in $(seq 1 60); do
  if ! fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; then break; fi
  sleep 5
done

apt-get update
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker --version
`
}

/**
 * Step 2: write the stack.
 *
 * The files arrive through quoted heredocs, so nothing in them is expanded by
 * the shell on the way in — `${...}` in the compose file stays literal for
 * Docker Compose to resolve, which is what it is for.
 */
export function buildWriteFiles(input: {
  deploymentId: string
  files: BootstrapFiles
}): string {
  const dir = deploymentDir(input.deploymentId)

  return `#!/bin/bash
set -euxo pipefail

mkdir -p ${dir}/n8n_data ${dir}/postgres_data ${dir}/caddy_data
cd ${dir}

cat > .env <<'TISIOPS_ENV'
${input.files.env}TISIOPS_ENV
chmod 600 .env

cat > Caddyfile <<'TISIOPS_CADDY'
${input.files.caddyfile}TISIOPS_CADDY

cat > docker-compose.yml <<'TISIOPS_COMPOSE'
${input.files.compose}TISIOPS_COMPOSE

# n8n runs as uid 1000 inside its container and needs to own its volume.
chown -R 1000:1000 ${dir}/n8n_data
ls -la ${dir}
`
}

/** Step 3: pull and start. */
export function buildStartStack(deploymentId: string): string {
  const dir = deploymentDir(deploymentId)

  return `#!/bin/bash
set -euxo pipefail
cd ${dir}

# Pulled first so a slow download is a pull failure rather than a start-up
# timeout, and so the log says which image was the problem.
docker compose pull
docker compose up -d
docker compose ps
`
}

/**
 * Step 4: are the containers actually up?
 *
 * Reports the state of each service, so "n8n exited" is visible here instead of
 * arriving later as an unexplained 502 from Caddy.
 */
export function buildVerifyStack(deploymentId: string): string {
  const dir = deploymentDir(deploymentId)

  return `#!/bin/bash
set -euo pipefail
cd ${dir}

for i in $(seq 1 60); do
  state=$(docker inspect -f '{{.State.Status}}' $(docker compose ps -q n8n 2>/dev/null) 2>/dev/null || echo missing)
  if [ "$state" = "running" ]; then
    echo "N8N_RUNNING"
    break
  fi
  sleep 5
done

echo "--- services ---"
docker compose ps --format '{{.Service}} {{.State}}'
echo "--- n8n tail ---"
docker compose logs --tail 20 n8n 2>&1 | tail -20
`
}
