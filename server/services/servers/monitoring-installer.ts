import {
  connectMonitoringSsh,
  type MonitoringConn,
  type SshExecResult,
} from "./monitoring-ssh"

/**
 * Phase 3 monitoring installer.
 *
 * This is the only place monitoring installation logic lives. It runs fixed,
 * backend-controlled commands over SSH and never accepts a command from the
 * AI, the frontend, or the queue payload — the queue carries two ids, and
 * everything the server runs is a constant below. Idempotent by construction:
 * every step only creates what is missing and never reinstalls a healthy stack.
 *
 * Sensitive material (keys, passwords) is passed in by the caller, held only in
 * memory for the life of one SSH connection, and never logged.
 */

export type MonitoringErrorCode =
  | "SSH_UNREACHABLE"
  | "SSH_AUTH_FAILED"
  | "SSH_TIMEOUT"
  | "SSH_DNS_FAILED"
  | "SSH_CONNECTION_REFUSED"
  | "SSH_CONNECTION_TIMEOUT"
  | "SSH_HANDSHAKE_TIMEOUT"
  | "SSH_HOST_UNREACHABLE"
  | "SSH_CONNECTION_RESET"
  | "SSH_UNKNOWN_ERROR"
  | "SUDO_UNAVAILABLE"
  | "DOCKER_INSTALL_FAILED"
  | "DOCKER_NOT_AVAILABLE"
  | "MONITORING_DIRECTORY_FAILED"
  | "MONITORING_CONFIG_FAILED"
  | "MONITORING_COMPOSE_FAILED"
  | "NODE_EXPORTER_START_FAILED"
  | "CADVISOR_START_FAILED"
  | "HEARTBEAT_START_FAILED"
  | "MONITORING_VERIFY_FAILED"
  | "UNKNOWN_MONITORING_INSTALL_ERROR"

export type MonitoringInstallResult =
  | { ok: true }
  | { ok: false; code: MonitoringErrorCode; message: string }

export type MonitoringInstallInput = {
  host: string
  sshPort: number
  sshUsername: string
  authType: "key" | "password"
  privateKey?: string
  password?: string
  passphrase?: string
  serverId: string
  installPath: string
  onLog?: (message: string) => void
}

export const AGENT_VERSION = "1"

export const MONITORING_ERROR_CODES: MonitoringErrorCode[] = [
  "SSH_UNREACHABLE",
  "SSH_AUTH_FAILED",
  "SSH_TIMEOUT",
  "SSH_DNS_FAILED",
  "SSH_CONNECTION_REFUSED",
  "SSH_CONNECTION_TIMEOUT",
  "SSH_HANDSHAKE_TIMEOUT",
  "SSH_HOST_UNREACHABLE",
  "SSH_CONNECTION_RESET",
  "SSH_UNKNOWN_ERROR",
  "SUDO_UNAVAILABLE",
  "DOCKER_INSTALL_FAILED",
  "DOCKER_NOT_AVAILABLE",
  "MONITORING_DIRECTORY_FAILED",
  "MONITORING_CONFIG_FAILED",
  "MONITORING_COMPOSE_FAILED",
  "NODE_EXPORTER_START_FAILED",
  "CADVISOR_START_FAILED",
  "HEARTBEAT_START_FAILED",
  "MONITORING_VERIFY_FAILED",
  "UNKNOWN_MONITORING_INSTALL_ERROR",
]

/**
 * Approved Docker CE install, copied verbatim from appServerBootstrap —
 * docker-ce + the compose plugin (what provides `docker compose`). There is no
 * second unrelated Docker installer in the codebase; this is the one.
 */
export const DOCKER_INSTALL_SCRIPT = `export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
`

/**
 * Fixed Phase 4 monitoring stack.
 *
 * node-exporter and cAdvisor bind ONLY to the host loopback (127.0.0.1) — never
 * public. The heartbeat runs on the same compose network, so it reaches the
 * collectors by service name and writes a timestamp only when both are healthy.
 * No privileged mode; cAdvisor gets the minimum host paths plus the /dev/kmsg
 * device it needs.
 */
export const MONITORING_COMPOSE = `services:
  node-exporter:
    image: prom/node-exporter:latest
    container_name: tisiops-node-exporter
    restart: unless-stopped
    ports:
      - "127.0.0.1:9100:9100"
    command:
      - --path.procfs=/host/proc
      - --path.sysfs=/host/sys
      - --path.rootfs=/host/root
      - --collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)
    volumes:
      - /:/host:ro
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: tisiops-cadvisor
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    devices:
      - /dev/kmsg
  heartbeat:
    image: alpine:3.20
    container_name: tisiops-heartbeat
    restart: unless-stopped
    volumes:
      - ./heartbeat:/heartbeat
    command: ["sh", "/heartbeat/heartbeat.sh"]
`

/** Writes a success timestamp only while both collectors answer. No secrets. */
export const HEARTBEAT_SCRIPT = `#!/bin/sh
HB=/heartbeat/last_heartbeat
while true; do
  NE=$(wget -q -O /dev/null http://node-exporter:9100/metrics && echo ok || echo fail)
  CA=$(wget -q -O /dev/null http://cadvisor:8080/metrics && echo ok || echo fail)
  if [ "$NE" = "ok" ] && [ "$CA" = "ok" ]; then
    echo "last_heartbeat=$(date -u +%Y-%m-%dT%H:%M:%SZ) node-exporter=ok cadvisor=ok" > "$HB"
  fi
  sleep 30
done
`

/** Only safe characters may be spliced into a root bash script. */
export function assertShellSafe(value: string, label: string): string {
  if (!/^[A-Za-z0-9_./-]+$/.test(value)) {
    throw new Error(`${label} contains unsafe characters`)
  }
  return value
}

/** Runs one connection → a series of fixed scripts → closes it. */
export async function installServerMonitoring(
  input: MonitoringInstallInput
): Promise<MonitoringInstallResult> {
  const installPath = assertShellSafe(input.installPath || "/opt/tisiops/monitoring", "installPath")
  const serverId = assertShellSafe(input.serverId, "serverId")

  const ssh = await connectMonitoringSsh({
    host: input.host,
    sshPort: input.sshPort,
    sshUsername: input.sshUsername,
    authType: input.authType,
    privateKey: input.privateKey,
    password: input.password,
    passphrase: input.passphrase,
    serverId,
    onLog: input.onLog,
  })
  if (!ssh.ok) {
    return { ok: false, code: ssh.code, message: ssh.message }
  }

  try {
    return await installPipeline(ssh.conn, { installPath, serverId })
  } finally {
    ssh.conn.close()
  }
}

async function installPipeline(
  conn: MonitoringConn,
  ctx: { installPath: string; serverId: string }
): Promise<MonitoringInstallResult> {
  const { installPath, serverId } = ctx
  const sudo = conn.sudo

  // 1. Preflight: what already exists?
  const preflight = await conn.exec(
    [
      "echo DOCKER=$([ -n \"$(command -v docker)\" ] && echo yes || echo no)",
      "echo COMPOSE_PLUGIN=$(docker compose version >/dev/null 2>&1 && echo yes || echo no)",
      `echo DIR=$([ -d "${installPath}" ] && echo exists || echo missing)`,
      `echo COMPOSE_FILE=$([ -f "${installPath}/docker-compose.yml" ] && echo exists || echo missing)`,
      `echo META_FILE=$([ -f "${installPath}/.tisiops-monitoring" ] && echo exists || echo missing)`,
      "",
    ].join("\n"),
    sudo
  )
  if (!preflight.ok) {
    return connectErrorResult(preflight)
  }

  const dockerPresent = /\bDOCKER=yes\b/.test(preflight.stdout)

  // 2. Docker missing? Install using the approved bootstrap commands, then recheck.
  if (dockerPresent) {
    // Docker is reused as-is; nothing to do.
  } else {
    const installed = await conn.exec(DOCKER_INSTALL_SCRIPT, sudo)
    const recheck = await conn.exec(
      "echo DOCKER=$([ -n \"$(command -v docker)\" ] && echo yes || echo no)\necho COMPOSE_PLUGIN=$(docker compose version >/dev/null 2>&1 && echo yes || echo no)\n",
      sudo
    )
    const nowPresent = /\bDOCKER=yes\b/.test(recheck.stdout)
    const composeNow = /\bCOMPOSE_PLUGIN=yes\b/.test(recheck.stdout)
    if (!installed.ok || !nowPresent || !composeNow) {
      return {
        ok: false,
        code: composeNow ? "DOCKER_NOT_AVAILABLE" : "DOCKER_INSTALL_FAILED",
        message: composeNow
          ? "Docker is not available on this server."
          : "Docker could not be installed on this server.",
      }
    }
  }

  // 3. Ensure the monitoring directory, files, and heartbeat script exist
  //    (deterministic overwrite, so re-runs are idempotent).
  const ensure = await conn.exec(
    [
      `mkdir -p "${installPath}/config" "${installPath}/heartbeat"`,
      // Drop the old Phase 3 placeholder container if it is still around.
      `docker rm -f tisiops-monitoring 2>/dev/null || true`,
      `cat > "${installPath}/.tisiops-monitoring" <<'TISIOPS_MONITORING_META'
version=1
serverId=${serverId}
managedBy=TisiOps
TISIOPS_MONITORING_META`,
      `cat > "${installPath}/docker-compose.yml" <<'TISIOPS_MONITORING_COMPOSE'
${MONITORING_COMPOSE}TISIOPS_MONITORING_COMPOSE`,
      `cat > "${installPath}/heartbeat/heartbeat.sh" <<'TISIOPS_MONITORING_HEARTBEAT'
${HEARTBEAT_SCRIPT}TISIOPS_MONITORING_HEARTBEAT`,
      `chmod +x "${installPath}/heartbeat/heartbeat.sh"`,
      "",
    ].join("\n"),
    sudo
  )
  if (!ensure.ok) {
    return {
      ok: false,
      code: "MONITORING_CONFIG_FAILED",
      message: "Monitoring configuration could not be written.",
    }
  }

  // 4. Start (or resume) the stack. Compose reconciles per service: a healthy
  //    container is left alone, a stopped or missing one is started. No full
  //    reinstall and no recreation of healthy containers.
  const started = await conn.exec(
    `docker compose -p tisiops-monitoring -f "${installPath}/docker-compose.yml" up -d\n`,
    sudo
  )
  if (!started.ok) {
    return {
      ok: false,
      code: "MONITORING_COMPOSE_FAILED",
      message: "Monitoring services could not be started on this server.",
    }
  }

  // 5. Verify the whole stack is actually healthy — never faked. Polls up to a
  //    minute for the heartbeat (which only records a success once both
  //    collectors answer) and checks every container is running.
  const verified = await conn.exec(
    [
      `HB=""
n=0
while [ "$n" -lt 12 ]; do
  sleep 5
  HB=$(cat "${installPath}/heartbeat/last_heartbeat" 2>/dev/null || echo "")
  if echo "$HB" | grep -q "node-exporter=ok" && echo "$HB" | grep -q "cadvisor=ok"; then
    n=12
  else
    n=$((n + 1))
  fi
done
echo "HB_RESULT=$HB"
echo "RUNNING=$(docker ps --filter name=tisiops- --format '{{.Names}}:{{.Status}}' 2>/dev/null)"
`,
    ].join("\n"),
    sudo
  )
  if (!verified.ok) {
    return {
      ok: false,
      code: "MONITORING_VERIFY_FAILED",
      message: "Monitoring verification failed to run on the server.",
    }
  }

  const hbOk =
    verified.stdout.includes("node-exporter=ok") &&
    verified.stdout.includes("cadvisor=ok")
  const nodeRunning = verified.stdout.includes("tisiops-node-exporter")
  const cadvisorRunning = verified.stdout.includes("tisiops-cadvisor")

  if (!nodeRunning) {
    return {
      ok: false,
      code: "NODE_EXPORTER_START_FAILED",
      message: "Node Exporter container is not running.",
    }
  }
  if (!cadvisorRunning) {
    return {
      ok: false,
      code: "CADVISOR_START_FAILED",
      message: "cAdvisor container is not running.",
    }
  }
  if (!hbOk) {
    return {
      ok: false,
      code: "MONITORING_VERIFY_FAILED",
      message: "Monitoring collectors are not answering.",
    }
  }

  return { ok: true }
}

function connectErrorResult(result: SshExecResult): MonitoringInstallResult {
  return {
    ok: false,
    code: "SSH_UNREACHABLE",
    message: "Could not reach the server over SSH.",
  }
}
