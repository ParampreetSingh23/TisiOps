import { randomBytes } from "node:crypto"

import { assertTemplatable } from "../bootstrap/shared"

export type PostgresFiles = {
  env: string
  compose: string
}

export function generatePostgresPassword(): string {
  return randomBytes(32).toString("base64url")
}

export function maskDatabaseUrl(input: {
  user: string
  host: string
  port: number
  database: string
}): string {
  return `postgresql://${input.user}:<hidden>@${input.host}:${input.port}/${input.database}`
}

export function databaseUrl(input: {
  user: string
  password: string
  host: string
  port: number
  database: string
}): string {
  return `postgresql://${input.user}:${input.password}@${input.host}:${input.port}/${input.database}`
}

export function deploymentDir(deploymentId: string): string {
  return `/opt/tisiops/postgres/${assertTemplatable("deployment id", deploymentId)}`
}

export function buildCloudInit(): string {
  return `#!/bin/bash
set -euxo pipefail

if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
`
}

export function buildFiles(input: {
  databaseName: string
  databaseUser: string
  password: string
  databaseUrl: string
  postgresVersion: string
}): PostgresFiles {
  const databaseName = assertTemplatable("database name", input.databaseName)
  const databaseUser = assertTemplatable("database user", input.databaseUser)
  const password = assertTemplatable("database password", input.password)
  const url = assertTemplatable("database url", input.databaseUrl)
  const postgresVersion = assertTemplatable(
    "postgres version",
    input.postgresVersion
  )

  return {
    env: `POSTGRES_DB=${databaseName}
POSTGRES_USER=${databaseUser}
POSTGRES_PASSWORD=${password}
DATABASE_URL=${url}
`,
    compose: `services:
  postgres:
    image: postgres:${postgresVersion}
    restart: always
    environment:
      POSTGRES_DB: \${POSTGRES_DB}
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - ./postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER} -d \${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 30
`,
  }
}

export function buildWriteFiles(input: {
  deploymentId: string
  files: PostgresFiles
}): string {
  const dir = deploymentDir(input.deploymentId)

  return `#!/bin/bash
set -euo pipefail

mkdir -p ${dir}/postgres_data
cd ${dir}

cat > .env <<'TISIOPS_ENV'
${input.files.env}TISIOPS_ENV
chmod 600 .env

cat > docker-compose.yml <<'TISIOPS_COMPOSE'
${input.files.compose}TISIOPS_COMPOSE
ls -la ${dir}
`
}

export function buildStartStack(deploymentId: string): string {
  const dir = deploymentDir(deploymentId)

  return `#!/bin/bash
set -euo pipefail
cd ${dir}
docker compose pull
docker compose up -d
docker compose ps
`
}

export function buildVerifyStack(deploymentId: string): string {
  const dir = deploymentDir(deploymentId)

  return `#!/bin/bash
set -euo pipefail
cd ${dir}
set -a
. ./.env
set +a

for i in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" | grep -q "accepting connections"; then
    echo "POSTGRES_READY"
    exit 0
  fi
  sleep 5
done

docker compose ps --format '{{.Service}} {{.State}}'
exit 1
`
}
