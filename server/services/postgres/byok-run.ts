import type { DeploymentJob } from "../../db/generated/client"
import { prisma } from "../../db/prisma"
import { decryptSecret, encryptSecret } from "../../utils/crypto"
import { buildDockerInstall } from "../bootstrap/n8nBootstrap.service"
import { connectMonitoringSsh } from "../servers/monitoring-ssh"
import { serverAddress } from "../servers/server.service"
import {
  buildFiles,
  buildStartStack,
  buildVerifyStack,
  buildWriteFiles,
  databaseUrl,
  generatePostgresPassword,
} from "./bootstrap"
import { validatePostgresConfig } from "./plans"

type Log = (message: string, level?: "INFO" | "WARNING" | "ERROR" | "SUCCESS") => Promise<unknown>

export async function runByokPostgresDeployment(job: DeploymentJob, log: Log) {
  const payload = job.payloadJson as { targetServerId?: string }
  if (!payload.targetServerId) return { ok: false as const, error: "BYOK server was not selected." }

  const deployment = await prisma.deployment.findUnique({ where: { id: job.deploymentId }, select: { userId: true } })
  const config = await prisma.postgresDeploymentConfig.findUnique({ where: { deploymentId: job.deploymentId } })
  const valid = config && validatePostgresConfig(config)
  if (!deployment || !valid || !valid.ok) return { ok: false as const, error: "Deployment configuration is invalid." }

  const server = await prisma.server.findFirst({ where: { id: payload.targetServerId, userId: deployment.userId }, include: { credentials: true } })
  if (!server?.credentialsStored || !server.credentials) return { ok: false as const, error: "Selected server no longer has SSH credentials." }
  const address = serverAddress(server)
  if (!address) return { ok: false as const, error: "Selected server has no reachable address." }

  const password = config.encryptedPassword ? decryptSecret(config.encryptedPassword) : generatePostgresPassword()
  const url = databaseUrl({ user: valid.config.databaseUser, password, host: address, port: 5432, database: valid.config.databaseName })
  await prisma.postgresDeploymentConfig.update({ where: { deploymentId: job.deploymentId }, data: { host: address, port: 5432, encryptedPassword: encryptSecret(password), encryptedDatabaseUrl: encryptSecret(url) } })

  const ssh = await connectMonitoringSsh({
    host: address,
    sshPort: server.sshPort,
    sshUsername: server.sshUsername || "ubuntu",
    authType: server.credentials.authType as "key" | "password",
    privateKey: server.credentials.encryptedPrivateKey ? decryptSecret(server.credentials.encryptedPrivateKey) : undefined,
    password: server.credentials.encryptedPassword ? decryptSecret(server.credentials.encryptedPassword) : undefined,
    passphrase: server.credentials.encryptedPassphrase ? decryptSecret(server.credentials.encryptedPassphrase) : undefined,
    serverId: server.id,
  })
  if (!ssh.ok) return { ok: false as const, error: ssh.message }

  try {
    const preflight = await ssh.conn.exec("ss -ltn '( sport = :5432 )' 2>/dev/null | tail -n +2\n", ssh.conn.sudo)
    if (preflight.ok && preflight.stdout.trim()) return { ok: false as const, error: "Port 5432 is already in use on the selected server." }

    const files = buildFiles({ databaseName: valid.config.databaseName, databaseUser: valid.config.databaseUser, password, databaseUrl: url, postgresVersion: valid.config.postgresVersion })
    for (const [label, script] of [["Installing Docker", buildDockerInstall()], ["Writing PostgreSQL configuration", buildWriteFiles({ deploymentId: job.deploymentId, files })], ["Starting PostgreSQL", buildStartStack(job.deploymentId)], ["Verifying PostgreSQL", buildVerifyStack(job.deploymentId)]] as const) {
      await log(label)
      if (!(await ssh.conn.exec(script, ssh.conn.sudo)).ok) return { ok: false as const, error: `${label} failed.` }
    }
  } finally {
    ssh.conn.close()
  }

  await prisma.deployment.update({ where: { id: job.deploymentId }, data: { status: "LIVE", statusDetail: "PostgreSQL is running on your connected server." } })
  await log("PostgreSQL is live on the selected server", "SUCCESS")
  return { ok: true as const }
}
