import { prisma } from "../../db/prisma"
import { withSpan } from "../observability/trace"
import { removeServerMetricsSchedule } from "../../queues/monitoring.queue"
import { decryptSecret } from "../../utils/crypto"
import { connectMonitoringSsh } from "./monitoring-ssh"
import { serverAddress } from "./server.service"
import {
  calculateMetricFreshness,
  HEARTBEAT_STALE_MS,
  type MetricFreshness,
  parseDockerSummary,
  parseHeartbeat,
  parseNodeExporterMetrics,
} from "./metrics-parse"

/**
 * Phase 5 metrics collector.
 *
 * Periodically reads the Phase 4 monitoring stack (node-exporter + Docker) over
 * the existing SSH session and upserts one normalized snapshot per server into
 * Postgres, so the UI and AI never open SSH to answer "how is my server?". The
 * raw Prometheus payload is parsed here and never stored, and no credentials
 * cross Redis, logs, telemetry, or the client.
 */

export type MetricCollectionErrorCode =
  | "METRICS_SSH_FAILED"
  | "NODE_EXPORTER_UNAVAILABLE"
  | "METRICS_PARSE_FAILED"
  | "DOCKER_STATUS_FAILED"
  | "HEARTBEAT_STALE"
  | "METRICS_COLLECTION_FAILED"

export type MetricCollectionResult =
  | { ok: true }
  | { ok: false; errorCode: MetricCollectionErrorCode; message: string }

export type MetricSnapshotValue = {
  cpuPercent: number | null
  memoryPercent: number | null
  diskPercent: number | null
  dockerStatus: string
  containerCount: number
  unhealthyContainers: number
  lastHeartbeatAt: Date | null
}

export { calculateMetricFreshness, parseDockerSummary, parseHeartbeat, parseNodeExporterMetrics, type MetricFreshness }

const MONITORING_PROJECT = "tisiops-monitoring"

/** Fixed, backend-controlled Docker summary command. */
const DOCKER_SUMMARY_SCRIPT = `if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    echo "DOCKER_STATUS=RUNNING"
    TOTAL=$(docker ps --filter status=running -q 2>/dev/null | wc -l | tr -d ' ')
    MON=$(docker ps --filter label=com.docker.compose.project=${MONITORING_PROJECT} --filter status=running -q 2>/dev/null | wc -l | tr -d ' ')
    echo "DOCKER_RUNNING=$((TOTAL - MON))"
    UH=$( (docker ps --filter health=unhealthy -q; docker ps --filter status=restarting -q; docker ps --filter status=dead -q) 2>/dev/null | sort -u | wc -l | tr -d ' ')
    echo "DOCKER_UNHEALTHY=$UH"
  else
    echo "DOCKER_STATUS=STOPPED"
    echo "DOCKER_RUNNING=0"
    echo "DOCKER_UNHEALTHY=0"
  fi
else
  echo "DOCKER_STATUS=UNAVAILABLE"
  echo "DOCKER_RUNNING=0"
  echo "DOCKER_UNHEALTHY=0"
fi
`

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function upsertSnapshot(
  userId: string,
  serverId: string,
  value: MetricSnapshotValue
): Promise<void> {
  await prisma.serverMetricSnapshot.upsert({
    where: { serverId },
    create: { userId, serverId, ...value, collectedAt: new Date() },
    update: { ...value, collectedAt: new Date() },
  })
}

/**
 * Collects the current snapshot for one ACTIVE server and writes it to Postgres.
 * On failure the previous snapshot is left untouched. The caller owns the SSH
 * connection lifecycle.
 */
export async function collectServerMetrics(
  serverId: string
): Promise<MetricCollectionResult> {
  return withSpan(
    "monitoring.metrics.collect",
    { serverId, collectionStatus: "started" },
    async () => {
      const monitoring = await prisma.serverMonitoring.findFirst({
        where: { serverId },
      })
      if (!monitoring || monitoring.status !== "ACTIVE") {
        // No longer monitored: stop the repeat schedule, not an error.
        await removeServerMetricsSchedule(serverId).catch(() => {})
        return { ok: true }
      }

      const server = await prisma.server.findFirst({
        where: { id: serverId, userId: monitoring.userId },
        include: { credentials: true },
      })
      if (!server) return { ok: true }

      const credentials = server.credentials
      if (!server.credentialsStored || !credentials) {
        return { ok: false, errorCode: "METRICS_SSH_FAILED", message: "No stored SSH credentials." }
      }

      let privateKey: string | undefined
      let password: string | undefined
      let passphrase: string | undefined
      try {
        if (credentials.encryptedPrivateKey) privateKey = decryptSecret(credentials.encryptedPrivateKey)
        if (credentials.encryptedPassword) password = decryptSecret(credentials.encryptedPassword)
        if (credentials.encryptedPassphrase) passphrase = decryptSecret(credentials.encryptedPassphrase)
      } catch {
        return { ok: false, errorCode: "METRICS_SSH_FAILED", message: "Could not read SSH credentials." }
      }

      const ssh = await connectMonitoringSsh({
        host: serverAddress(server),
        sshPort: server.sshPort,
        sshUsername: server.sshUsername || "ubuntu",
        authType: credentials.authType as "key" | "password",
        privateKey,
        password,
        passphrase,
      })
      if (!ssh.ok) {
        return { ok: false, errorCode: "METRICS_SSH_FAILED", message: ssh.message }
      }

      try {
        const sudo = ssh.conn.sudo

        const raw1 = await withSpan("monitoring.node_exporter.read", { serverId }, () =>
          ssh.conn.exec("curl -fsS --max-time 15 http://127.0.0.1:9100/metrics", sudo)
        )
        if (!raw1.ok) {
          return { ok: false, errorCode: "NODE_EXPORTER_UNAVAILABLE", message: "node-exporter did not answer." }
        }
        await sleep(1500)
        const raw2 = await ssh.conn.exec("curl -fsS --max-time 15 http://127.0.0.1:9100/metrics", sudo)

        const parsed = parseNodeExporterMetrics(
          raw2.ok ? [raw1.stdout, raw2.stdout] : [raw1.stdout]
        )
        if (parsed.memoryPercent == null && parsed.diskPercent == null) {
          return { ok: false, errorCode: "METRICS_PARSE_FAILED", message: "Could not parse node-exporter metrics." }
        }

        const docker = await withSpan("monitoring.docker.inspect", { serverId }, () =>
          ssh.conn.exec(DOCKER_SUMMARY_SCRIPT, sudo)
        )
        if (!docker.ok) {
          return { ok: false, errorCode: "DOCKER_STATUS_FAILED", message: "Could not read Docker state." }
        }
        const dockerSummary = parseDockerSummary(docker.stdout)

        const heartbeat = await withSpan("monitoring.heartbeat.read", { serverId }, () =>
          ssh.conn.exec(`cat "${monitoring.installPath || "/opt/tisiops/monitoring"}/heartbeat/last_heartbeat" 2>/dev/null || true`, sudo)
        )
        const heartbeatAt = parseHeartbeat(heartbeat.stdout)
        const freshHeartbeat =
          heartbeatAt && Date.now() - heartbeatAt.getTime() < HEARTBEAT_STALE_MS
            ? heartbeatAt
            : null

        const value: MetricSnapshotValue = {
          cpuPercent: parsed.cpuPercent,
          memoryPercent: parsed.memoryPercent,
          diskPercent: parsed.diskPercent,
          dockerStatus: dockerSummary.dockerStatus,
          containerCount: dockerSummary.containerCount,
          unhealthyContainers: dockerSummary.unhealthyContainers,
          lastHeartbeatAt: freshHeartbeat,
        }

        const now = new Date()
        await withSpan(
          "monitoring.snapshot.upsert",
          { serverId, dockerStatus: dockerSummary.dockerStatus, collectionStatus: "success" },
          () => upsertSnapshot(monitoring.userId, serverId, value)
        )

        await prisma.serverMonitoring.update({
          where: { id: monitoring.id },
          data: { lastCheckedAt: now, lastHeartbeatAt: freshHeartbeat ?? null },
        })

        return { ok: true }
      } catch {
        return { ok: false, errorCode: "METRICS_COLLECTION_FAILED", message: "Server metrics collection failed." }
      } finally {
        ssh.conn.close()
      }
    }
  )
}

/** Latest snapshot for a server the caller owns, plus its freshness. */
export async function getLatestServerMetrics(
  userId: string,
  serverId: string
): Promise<
  | { ok: false }
  | {
      ok: true
      metrics: {
        serverId: string
        cpuPercent: number | null
        memoryPercent: number | null
        diskPercent: number | null
        dockerStatus: string | null
        containerCount: number
        unhealthyContainers: number
        lastHeartbeatAt: Date | null
        collectedAt: Date | null
        freshness: MetricFreshness
      }
    }
> {
  const server = await prisma.server.findFirst({
    where: { id: serverId, userId },
    select: { id: true },
  })
  if (!server) return { ok: false }

  const snapshot = await prisma.serverMetricSnapshot.findFirst({
    where: { serverId, userId },
  })
  if (!snapshot) {
    return {
      ok: true,
      metrics: {
        serverId,
        cpuPercent: null,
        memoryPercent: null,
        diskPercent: null,
        dockerStatus: null,
        containerCount: 0,
        unhealthyContainers: 0,
        lastHeartbeatAt: null,
        collectedAt: null,
        freshness: "UNAVAILABLE",
      },
    }
  }

  return {
    ok: true,
    metrics: {
      serverId,
      cpuPercent: snapshot.cpuPercent,
      memoryPercent: snapshot.memoryPercent,
      diskPercent: snapshot.diskPercent,
      dockerStatus: snapshot.dockerStatus,
      containerCount: snapshot.containerCount,
      unhealthyContainers: snapshot.unhealthyContainers,
      lastHeartbeatAt: snapshot.lastHeartbeatAt,
      collectedAt: snapshot.collectedAt,
      freshness: calculateMetricFreshness(snapshot.collectedAt),
    },
  }
}
