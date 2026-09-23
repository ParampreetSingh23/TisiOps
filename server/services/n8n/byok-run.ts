import type { DeploymentJob } from "../../db/generated/client"
import { prisma } from "../../db/prisma"
import { decryptSecret, encryptSecret } from "../../utils/crypto"
import { connectMonitoringSsh } from "../servers/monitoring-ssh"
import { serverAddress } from "../servers/server.service"
import { buildDockerInstall, buildFiles, buildStartStack, buildVerifyStack, buildWriteFiles, generateSecrets } from "../bootstrap/n8nBootstrap.service"
import { validateN8nConfig } from "./plans"

export async function runByokN8nDeployment(job: DeploymentJob, log: (message: string, level?: "INFO" | "WARNING" | "ERROR" | "SUCCESS") => Promise<unknown>) {
  const payload = job.payloadJson as { targetServerId?: string }
  if (!payload.targetServerId) return { ok: false as const, error: "BYOK server was not selected." }
  const deployment = await prisma.deployment.findUnique({ where: { id: job.deploymentId }, select: { userId: true } })
  if (!deployment) return { ok: false as const, error: "Deployment not found." }
  const config = await prisma.n8nDeploymentConfig.findUnique({ where: { deploymentId: job.deploymentId } })
  const valid = config && validateN8nConfig(config)
  if (!valid || !valid.ok) return { ok: false as const, error: "Deployment configuration is invalid." }
  const server = await prisma.server.findFirst({ where: { id: payload.targetServerId, userId: deployment.userId }, include: { credentials: true } })
  if (!server?.credentialsStored || !server.credentials) return { ok: false as const, error: "Selected server no longer has SSH credentials." }
  const address = serverAddress(server)
  if (!address) return { ok: false as const, error: "Selected server has no reachable address." }
  const secrets = generateSecrets()
  await prisma.n8nDeploymentConfig.update({ where: { deploymentId: job.deploymentId }, data: { encryptedEncryptionKey: encryptSecret(secrets.encryptionKey), encryptedDbPassword: encryptSecret(secrets.dbPassword) } })
  const ssh = await connectMonitoringSsh({ host: address, sshPort: server.sshPort, sshUsername: server.sshUsername || "ubuntu", authType: server.credentials.authType as "key" | "password", privateKey: server.credentials.encryptedPrivateKey ? decryptSecret(server.credentials.encryptedPrivateKey) : undefined, password: server.credentials.encryptedPassword ? decryptSecret(server.credentials.encryptedPassword) : undefined, passphrase: server.credentials.encryptedPassphrase ? decryptSecret(server.credentials.encryptedPassphrase) : undefined, serverId: server.id })
  if (!ssh.ok) return { ok: false as const, error: ssh.message }
  try {
    const preflight = await ssh.conn.exec("ss -ltn '( sport = :80 or sport = :443 )' 2>/dev/null | tail -n +2\n", ssh.conn.sudo)
    if (preflight.ok && preflight.stdout.trim()) return { ok: false as const, error: "Ports 80 or 443 are already in use on the selected server." }
    for (const [label, script] of [["Installing Docker", buildDockerInstall()], ["Writing n8n configuration", buildWriteFiles({ deploymentId: job.deploymentId, files: buildFiles({ deploymentId: job.deploymentId, config: valid.config, secrets, elasticIp: address }) })], ["Starting n8n", buildStartStack(job.deploymentId)], ["Verifying n8n", buildVerifyStack(job.deploymentId)]] as const) {
      await log(label)
      const result = await ssh.conn.exec(script, ssh.conn.sudo)
      if (!result.ok) return { ok: false as const, error: `${label} failed.` }
    }
  } finally { ssh.conn.close() }
  await prisma.deployment.update({ where: { id: job.deploymentId }, data: { status: "LIVE", publicUrl: valid.config.domain ? `https://${valid.config.domain}` : `http://${address}`, statusDetail: "n8n is running on your connected server." } })
  await log("n8n is live on the selected server", "SUCCESS")
  return { ok: true as const }
}
