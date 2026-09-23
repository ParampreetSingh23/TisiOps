import { decryptSecret } from "../../utils/crypto"
import { redact } from "../redaction"
import { connectMonitoringSsh } from "./monitoring-ssh"
import { serverAddress } from "./server.service"
import { SERVER_CAPABILITIES, type ServerCapability } from "./copilot-capabilities"
import { prisma } from "../../db/prisma"
import type { ServerRepairAction } from "../agents/server-repair.agent"

const SCRIPTS: Record<Extract<ServerCapability, keyof typeof SERVER_CAPABILITIES>, string | null> = {
  SERVER_HEALTH: "uptime; systemctl is-system-running || true\n",
  DISK_USAGE: "df -h /\n",
  MEMORY_USAGE: "free -h\n",
  CPU_USAGE: "uptime; nproc\n",
  LIST_CONTAINERS: "if command -v docker >/dev/null 2>&1; then docker ps -a --format '{{.Names}}\\t{{.Status}}\\t{{.Ports}}'; else echo 'Docker is not installed.'; fi\n",
  CONTAINER_STATUS: "if command -v docker >/dev/null 2>&1; then docker ps -a --format '{{.Names}}\\t{{.Status}}'; else echo 'Docker is not installed.'; fi\n",
  CONTAINER_LOGS: "if command -v docker >/dev/null 2>&1; then docker ps -a --format '{{.Names}}\\t{{.Status}}'; else echo 'Docker is not installed.'; fi\n",
  SERVICE_STATUS: "systemctl --failed --no-legend || true\n",
  SERVICE_LOGS: "journalctl -p warning -n 200 --no-pager 2>/dev/null || true\n",
  LIST_PORTS: "ss -ltnp 2>/dev/null || ss -ltn 2>/dev/null || true\n",
  GIT_STATUS: "find /opt/tisiops/apps -maxdepth 2 -type d -name .git -print 2>/dev/null | head -20 || true\n",
  NGINX_STATUS: "systemctl is-active nginx 2>/dev/null || true\n",
  CADDY_STATUS: "systemctl is-active caddy 2>/dev/null || true\n",
  INSTALL_DOCKER: null,
  INSTALL_APACHE: null,
  INSTALL_GIT: null,
  CLONE_REPOSITORY: null,
  CHECKOUT_BRANCH: null,
  DEPLOY_DOCKER_APP: null,
  DEPLOY_DOCKER_COMPOSE: null,
  CONFIGURE_NGINX_PROXY: null,
  CONFIGURE_CADDY_PROXY: null,
  RESTART_CONTAINER: null,
  RESTART_SUPPORTED_SERVICE: null,
  DEPLOY_POSTGRES: null,
  DEPLOY_REDIS: null,
}

export type CopilotInspection = {
  capability: ServerCapability
  risk: "READ_ONLY" | "EXECUTION" | "DESTRUCTIVE"
  output: string
}


export async function inspectServerCapability(input: {
  userId: string
  serverId: string
  capability: ServerCapability
  containerName?: string | null
}): Promise<{ ok: true; result: CopilotInspection } | { ok: false; status: number; error: string }> {
  const definition = SERVER_CAPABILITIES[input.capability]
  const script = input.capability === "CONTAINER_LOGS" && input.containerName
    ? `if command -v docker >/dev/null 2>&1 && docker container inspect ${input.containerName} >/dev/null 2>&1; then docker logs --tail 200 ${input.containerName} 2>&1; else echo 'Container ${input.containerName} was not found.'; fi\n`
    : SCRIPTS[input.capability]
  if (definition.risk !== "READ_ONLY" || !script) {
    return { ok: false, status: 422, error: "This operation requires an approved execution plan." }
  }

  const server = await prisma.server.findFirst({
    where: { id: input.serverId, userId: input.userId },
    include: { credentials: true },
  })
  if (!server) return { ok: false, status: 404, error: "Server not found" }
  if (!server.credentialsStored || !server.credentials) {
    return { ok: false, status: 422, error: "Stored SSH credentials are required." }
  }

  try {
    const ssh = await connectMonitoringSsh({
      host: serverAddress(server), sshPort: server.sshPort,
      sshUsername: server.sshUsername || "ubuntu",
      authType: server.credentials.authType as "key" | "password",
      privateKey: server.credentials.encryptedPrivateKey ? decryptSecret(server.credentials.encryptedPrivateKey) : undefined,
      password: server.credentials.encryptedPassword ? decryptSecret(server.credentials.encryptedPassword) : undefined,
      passphrase: server.credentials.encryptedPassphrase ? decryptSecret(server.credentials.encryptedPassphrase) : undefined,
      serverId: server.id,
    })
    if (!ssh.ok) return { ok: false, status: 502, error: ssh.message }
    try {
      const executed = await ssh.conn.exec(script)
      if (!executed.ok) return { ok: false, status: 502, error: "Server inspection failed." }
      return { ok: true, result: { capability: input.capability, risk: definition.risk, output: redact(executed.stdout).slice(0, 24_000) } }
    } finally {
      ssh.conn.close()
    }
  } catch {
    return { ok: false, status: 502, error: "Server inspection failed." }
  }
}

export function serverCopilotContext(server: {
  id: string; provider: string; name: string; osType: string | null; osVersion: string | null
  cpuInfo: string | null; memoryMb: number | null; diskGb: number | null; dockerStatus: string | null; status: string
}) {
  return { serverId: server.id, provider: server.provider, name: server.name, os: server.osVersion || server.osType, resources: { cpu: server.cpuInfo, memoryMb: server.memoryMb, diskGb: server.diskGb }, dockerStatus: server.dockerStatus, status: server.status }
}

/** Plans are data, never shell. Worker maps these ids to fixed handlers. */
export async function planServerCopilotExecution(input: {
  userId: string
  serverId: string
  capability: ServerCapability
}) {
  if (!(["INSTALL_DOCKER", "INSTALL_APACHE", "INSTALL_GIT"] as const).includes(input.capability as "INSTALL_DOCKER" | "INSTALL_APACHE" | "INSTALL_GIT")) {
    return { ok: false as const, status: 422, error: "This server operation is not implemented yet." }
  }
  const server = await prisma.server.findFirst({ where: { id: input.serverId, userId: input.userId } })
  if (!server) return { ok: false as const, status: 404, error: "Server not found" }
  if (!/ubuntu|debian/i.test(`${server.osType ?? ""} ${server.osVersion ?? ""}`)) {
    return { ok: false as const, status: 422, error: "Docker installation is supported only on Ubuntu or Debian servers." }
  }
  if (input.capability === "INSTALL_DOCKER" && server.dockerStatus === "INSTALLED") {
    return { ok: false as const, status: 409, error: "Docker is already installed on this server." }
  }

  const isDocker = input.capability === "INSTALL_DOCKER"
  const isApache = input.capability === "INSTALL_APACHE"
  const actions: ServerRepairAction[] = [{
    id: isDocker ? "install_docker" : isApache ? "install_apache" : "install_git",
    label: isDocker ? "Install Docker Engine and Compose plugin" : isApache ? "Install Apache HTTP Server" : "Install Git",
    risk: "EXECUTION", requiresApproval: true, implemented: true,
  }]
  const plan = await prisma.serverRepairPlan.create({
    data: {
      userId: input.userId, serverId: input.serverId, issueType: isDocker ? "COPILOT_INSTALL_DOCKER" : isApache ? "COPILOT_INSTALL_APACHE" : "COPILOT_INSTALL_GIT",
      diagnosis: isDocker ? "Docker is not installed on this server." : isApache ? "Apache will be installed and enabled on this server." : "Git will be installed on this server.",
      evidenceJson: [`OS: ${server.osVersion || server.osType || "unknown"}`, isDocker ? "Docker: not installed" : "Change: package installation"],
      actionsJson: actions as never, riskLevel: "EXECUTION", approvalRequired: true, status: "APPROVAL_REQUIRED",
    },
  })
  return { ok: true as const, plan: { id: plan.id, serverId: plan.serverId, diagnosis: plan.diagnosis, actions } }
}
