"use client"

import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

import { ConfirmModal } from "@/components/dashboard/confirm-modal"
import type { MonitoringRecord } from "@/components/dashboard/monitoring-status-card"
import { apiFetch } from "@/lib/api"
import { card, primaryButton, secondaryButton } from "@/lib/ui"

type MetricsLatest = {
  serverId: string
  cpuPercent: number | null
  memoryPercent: number | null
  diskPercent: number | null
  dockerStatus: string | null
  containerCount: number
  unhealthyContainers: number
  lastHeartbeatAt: string | null
  collectedAt: string | null
  freshness: "FRESH" | "STALE" | "UNAVAILABLE"
}

type SafeServer = {
  id: string
  name: string
  provider: string
  host?: string
  publicIp?: string
  elasticIp?: string
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "border-[#cfe6dc] bg-[#f2f9f6] text-[#0f6b4f] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
  INSTALLING: "border-brand bg-brand-soft text-brand dark:border-brand dark:bg-brand/10 dark:text-brand",
  UPGRADING: "border-brand bg-brand-soft text-brand dark:border-brand dark:bg-brand/10 dark:text-brand",
  FAILED: "border-[#f0d3cc] bg-[#fdf4f2] text-[#a8341f] dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400",
  NOT_INSTALLED: "border-line-warm bg-canvas text-ink-muted",
  DISABLED: "border-line-warm bg-canvas text-ink-muted",
}

const BADGE_LABELS: Record<string, string> = {
  NOT_INSTALLED: "Not installed",
  INSTALLING: "Installing",
  ACTIVE: "Active",
  FAILED: "Failed",
  DISABLED: "Disabled",
  UPGRADING: "Upgrading",
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—"
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.max(0, Math.round(diff / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function percentTone(p: number | null): string {
  if (p == null) return "text-ink-strong"
  if (p >= 85) return "text-red-600 dark:text-red-400"
  if (p >= 70) return "text-amber-600 dark:text-amber-400"
  return "text-ink-strong"
}

function barTone(p: number | null): string {
  if (p == null) return "bg-line-warm"
  if (p >= 85) return "bg-red-500"
  if (p >= 70) return "bg-amber-500"
  return "bg-emerald-500"
}

function dockerStatusLabel(status: string | null): string {
  if (status === "RUNNING") return "Running"
  if (status === "STOPPED") return "Stopped"
  if (status === "UNAVAILABLE") return "Unavailable"
  if (status === "UNKNOWN") return "Unknown"
  return status ?? "Unknown"
}

function MetricBlock({
  label,
  pct,
}: {
  label: string
  pct: number | null
}) {
  return (
    <div className="rounded-[6px] border border-line-warm/60 bg-canvas/40 p-4">
      <span className="block text-xs text-ink-muted">{label}</span>
      <p className={`mt-1 text-2xl font-semibold tracking-[-0.02em] ${percentTone(pct)}`}>
        {pct == null ? "—" : `${Math.round(pct)}%`}
      </p>
      {pct == null ? null : (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line-warm/60">
          <div
            className={`h-full rounded-full ${barTone(pct)}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      )}
    </div>
  )
}

function HealthRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2.5 py-2 text-sm">
      <span
        className={`size-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
        aria-hidden
      />
      <span className="text-ink-default">{text}</span>
    </div>
  )
}

/**
 * Phase 6 monitoring dashboard. Reads the postgres snapshot (Phase 5) — never
 * SSH, node-exporter, cAdvisor, SigNoz, or Grafana. Every status state renders
 * honestly: stale data is marked stale, and a missing snapshot never shows
 * fake zeroes.
 */
export default function ServerMonitoringPage() {
  const params = useParams()
  const serverId = params.serverId as string

  const [server, setServer] = useState<SafeServer | null>(null)
  const [monitoring, setMonitoring] = useState<MonitoringRecord | null>(null)
  const [metrics, setMetrics] = useState<MetricsLatest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<"enable" | "retry" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const load = useCallback(async () => {
    try {
      const [serverData, monitoringData, metricsData] = await Promise.all([
        apiFetch<SafeServer>(`/api/servers/${serverId}`),
        apiFetch<MonitoringRecord>(`/api/servers/${serverId}/monitoring`),
        apiFetch<MetricsLatest>(`/api/servers/${serverId}/metrics/latest`),
      ])
      setServer(serverData)
      setMonitoring(monitoringData)
      setMetrics(metricsData)
      setError(null)
    } catch {
      setError("Unable to load monitoring data.")
    }
    setLoading(false)
  }, [serverId])

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0)
    return () => clearTimeout(initial)
  }, [load])

  // Auto-refresh ~45s, paused when the tab is hidden. Only re-reads backend
  // APIs — never schedules a new worker job.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return
      void load()
    }, 45_000)
    return () => clearInterval(timer)
  }, [load])

  const handleEnable = async () => {
    setIsSubmitting(true)
    try {
      await apiFetch(`/api/servers/${serverId}/monitoring/enable`, { method: "POST" })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not enable monitoring.")
    } finally {
      setIsSubmitting(false)
      setModal(null)
    }
  }

  const status = monitoring?.status ?? "NOT_INSTALLED"
  const isActive = status === "ACTIVE"
  const freshness = metrics?.freshness ?? "UNAVAILABLE"
  const hasSnapshot = Boolean(metrics?.collectedAt)
  const stale = isActive && freshness === "STALE"
  const noSnapshot = isActive && !hasSnapshot

  const healthRows = useMemo(() => {
    if (!hasSnapshot) return []
    const rows: { ok: boolean; text: string }[] = []
    const dockerRunning = metrics?.dockerStatus === "RUNNING"
    rows.push({
      ok: dockerRunning,
      text: dockerRunning
        ? "Docker daemon healthy"
        : `Docker daemon ${dockerStatusLabel(metrics?.dockerStatus ?? null).toLowerCase()}`,
    })
    const heartbeatFresh = Boolean(metrics?.lastHeartbeatAt)
    rows.push({
      ok: heartbeatFresh,
      text: heartbeatFresh
        ? "Monitoring heartbeat received"
        : "Monitoring heartbeat not received",
    })
    rows.push({ ok: true, text: "Metrics collection successful" })
    const unhealthy = metrics?.unhealthyContainers ?? 0
    rows.push({
      ok: unhealthy === 0,
      text:
        unhealthy === 0
          ? "No unhealthy containers detected"
          : `${unhealthy} unhealthy container${unhealthy === 1 ? "" : "s"} detected`,
    })
    return rows
  }, [hasSnapshot, metrics])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center">
        <Loader2 className="size-6 animate-spin text-brand" />
        <p className="mt-2 text-xs text-ink-muted">Loading monitoring…</p>
      </div>
    )
  }

  if (error && !monitoring) {
    return (
      <div className="rounded-[6px] border border-line bg-surface p-8 text-center shadow-card">
        <AlertCircle className="mx-auto size-8 text-amber-500" />
        <h2 className="mt-4 font-heading text-lg font-semibold text-ink-strong">
          Monitoring Unavailable
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{error}</p>
        <Link
          href={`/dashboard/servers/${serverId}`}
          className={`mt-6 inline-flex ${secondaryButton}`}
        >
          <ArrowLeft className="mr-2 size-4" /> Back to Server
        </Link>
      </div>
    )
  }

  const headerAction = (() => {
    switch (status) {
      case "ACTIVE":
        return null
      case "INSTALLING":
        return (
          <button disabled className={primaryButton}>
            Installing...
          </button>
        )
      case "UPGRADING":
        return (
          <button disabled className={primaryButton}>
            Upgrading...
          </button>
        )
      case "FAILED":
        return (
          <button onClick={() => setModal("retry")} className={secondaryButton}>
            Retry Monitoring Setup
          </button>
        )
      default:
        return (
          <button onClick={() => setModal("enable")} className={primaryButton}>
            Enable Monitoring
          </button>
        )
    }
  })()

  const stateMessage = (() => {
    switch (status) {
      case "ACTIVE":
        return null
      case "INSTALLING":
        return "Monitoring setup is still in progress."
      case "UPGRADING":
        return "Monitoring is upgrading."
      case "FAILED":
        return "Monitoring setup failed."
      case "DISABLED":
        return "Monitoring is disabled."
      default:
        return "Monitoring is not installed on this server."
    }
  })()

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink-strong">
              Server Monitoring
            </h1>
            <span
              className={`rounded-[4px] border px-2 py-0.5 text-xs font-semibold ${
                STATUS_BADGE[status] ?? STATUS_BADGE.NOT_INSTALLED
              }`}
            >
              {BADGE_LABELS[status] ?? BADGE_LABELS.NOT_INSTALLED}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {server?.name ?? "Server"}
            <span className="text-ink-muted/70"> · {server?.provider ?? "—"}</span>
            {server?.elasticIp || server?.host || server?.publicIp ? (
              <span className="font-mono text-ink-muted/70">
                {" "}
                · {server.elasticIp || server.host || server.publicIp}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void load()} className={secondaryButton}>
            <RefreshCw className="mr-2 size-4" aria-hidden />
            Refresh
          </button>
          <Link href={`/dashboard/servers/${serverId}`} className={secondaryButton}>
            <ArrowLeft className="mr-2 size-4" aria-hidden />
            Back to Server
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] p-3 text-sm text-[#a8341f] dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
          <button onClick={() => void load()} className="ml-3 font-medium underline">
            Retry
          </button>
        </div>
      )}

      {stateMessage ? (
        <section className={`${card} space-y-4`}>
          <p className="text-sm text-ink-default">{stateMessage}</p>
          {status === "FAILED" && monitoring?.errorMessage ? (
            <p className="text-xs text-ink-muted">{monitoring.errorMessage}</p>
          ) : null}
          {headerAction}
        </section>
      ) : (
        <>
          {stale ? (
            <div className="flex items-center gap-2 rounded-[6px] border border-amber-300/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              <span>
                Monitoring is active, but the latest metrics are stale.
              </span>
            </div>
          ) : null}

          {noSnapshot ? (
            <div className="flex items-center gap-2 rounded-[6px] border border-line-warm bg-canvas px-4 py-3 text-sm text-ink-default">
              <AlertCircle className="size-4 shrink-0 text-ink-muted" aria-hidden />
              Monitoring is active, but no metric snapshot has been collected yet.
            </div>
          ) : null}

          {/* Top health summary */}
          <section className={card}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-muted">Monitoring</p>
                <p className="mt-1 text-sm font-semibold text-ink-strong">
                  {BADGE_LABELS[status] ?? "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Last heartbeat</p>
                <p className="mt-1 text-sm font-medium text-ink-default">
                  {timeAgo(metrics?.lastHeartbeatAt)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Last updated</p>
                <p className="mt-1 text-sm font-medium text-ink-default">
                  {timeAgo(metrics?.collectedAt)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Data freshness</p>
                <p className="mt-1 text-sm font-medium text-ink-default">
                  {freshness === "FRESH"
                    ? "Fresh"
                    : freshness === "STALE"
                    ? "Stale"
                    : "Unavailable"}
                </p>
              </div>
            </div>
          </section>

          {/* Core metrics */}
          <section className={card}>
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-base font-semibold text-ink-strong">
                Resource Usage
              </h2>
              {stale ? (
                <span className="text-xs text-ink-muted">Last known value</span>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricBlock label="CPU" pct={metrics?.cpuPercent ?? null} />
              <MetricBlock label="Memory" pct={metrics?.memoryPercent ?? null} />
              <MetricBlock label="Disk" pct={metrics?.diskPercent ?? null} />
            </div>
          </section>

          {/* Docker */}
          <section className={card}>
            <h2 className="font-heading text-base font-semibold text-ink-strong">
              Docker & Containers
            </h2>
            <div className="mt-3 divide-y divide-line/60">
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink-muted">Docker Status</span>
                <span className="font-medium text-ink-strong">
                  {dockerStatusLabel(metrics?.dockerStatus ?? null)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink-muted">Running Containers</span>
                <span className="font-medium text-ink-strong">
                  {hasSnapshot ? metrics?.containerCount ?? 0 : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink-muted">Unhealthy Containers</span>
                <span
                  className={
                    (metrics?.unhealthyContainers ?? 0) > 0
                      ? "font-semibold text-red-600 dark:text-red-400"
                      : "font-medium text-ink-strong"
                  }
                >
                  {hasSnapshot ? metrics?.unhealthyContainers ?? 0 : "—"}
                </span>
              </div>
            </div>
          </section>

          {/* Recent health */}
          {healthRows.length > 0 ? (
            <section className={card}>
              <h2 className="font-heading text-base font-semibold text-ink-strong">
                Recent Health
              </h2>
              <div className="mt-2 divide-y divide-line/50">
                {healthRows.map((row, i) => (
                  <HealthRow key={i} ok={row.ok} text={row.text} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Monitoring details */}
          <section className={card}>
            <h2 className="font-heading text-base font-semibold text-ink-strong">
              Monitoring Details
            </h2>
            <div className="mt-3 divide-y divide-line/60 text-sm">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">Agent version</span>
                <span className="font-mono text-ink-strong">
                  {monitoring?.agentVersion ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">Installed</span>
                <span className="text-ink-strong">
                  {monitoring?.installedAt
                    ? new Date(monitoring.installedAt).toLocaleString()
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">Last checked</span>
                <span className="text-ink-strong">
                  {monitoring?.lastCheckedAt
                    ? new Date(monitoring.lastCheckedAt).toLocaleString()
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">Collected at</span>
                <span className="text-ink-strong">
                  {metrics?.collectedAt
                    ? new Date(metrics.collectedAt).toLocaleString()
                    : "—"}
                </span>
              </div>
            </div>
          </section>
        </>
      )}

      <ConfirmModal
        open={modal !== null}
        title={
          modal === "retry"
            ? "Retry Monitoring Setup"
            : "Enable Server Monitoring"
        }
        description={
          modal === "retry"
            ? "TisiOps will retry preparing this server for monitoring. Monitoring installs only once for this server."
            : "TisiOps will prepare this server for monitoring so CPU, memory, disk, Docker, and service health can be tracked.\n\nMonitoring is installed only once for this server."
        }
        confirmText={modal === "retry" ? "Retry Setup" : "Enable Monitoring"}
        cancelText="Cancel"
        variant="default"
        isSubmitting={isSubmitting}
        onConfirm={() => void handleEnable()}
        onClose={() => setModal(null)}
      />
    </div>
  )
}
