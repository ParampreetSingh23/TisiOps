"use client"

import {
  AlertCircle,
  Activity,
  ArrowLeft,
  Cpu,
  HardDrive,
  Key,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Pause,
  Power,
  RefreshCw,
  Server as ServerIcon,
  ShieldCheck,
  Terminal,
  Trash2,
  Wifi,
  WifiOff,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { ConfirmModal } from "@/components/dashboard/confirm-modal"
import { MonitoringStatusCard } from "@/components/dashboard/monitoring-status-card"
import { SshCredentialsModal } from "@/components/dashboard/ssh-credentials-modal"
import { apiFetch } from "@/lib/api"
import { primaryButton, secondaryButton } from "@/lib/ui"
import {
  formatStatus,
  providerLabel,
  StatusDot,
  type ServerRecord,
} from "@/components/dashboard/servers-view"

/**
 * Compact stat tile used in the resource bar.
 */
function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-1 items-center gap-3 min-w-0">
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-[4px] ${
          accent ? "bg-brand/10 text-brand" : "bg-canvas text-ink-muted"
        }`}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold tracking-[-0.01em] text-ink-strong">
          {value}
        </p>
        <p className="truncate text-[11px] text-ink-muted">{label}</p>
      </div>
    </div>
  )
}

/**
 * Section header shared across detail cards.
 */
function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line pb-2.5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
        {title}
      </h2>
      {children}
    </div>
  )
}

export default function ServerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const serverId = params.serverId as string

  const [server, setServer] = useState<ServerRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false)
  const [showConfirmPause, setShowConfirmPause] = useState(false)
  const [showConfirmRestart, setShowConfirmRestart] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [powerAction, setPowerAction] = useState<"pause" | "restart" | null>(null)
  const [prepareAlert, setPrepareAlert] = useState(false)
  const [showCredentials, setShowCredentials] = useState(false)

  /** Ref to track whether load has resolved — avoids stale setState after navigation. */
  const mountedRef = useRef(true)

  const loadServer = useCallback(async () => {
    try {
      setIsLoading((prev) => !prev) // first call: true→false won't flicker; we handle initial loading below
      const data = await apiFetch<ServerRecord>(`/api/servers/${serverId}`)
      if (mountedRef.current) setServer(data)
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : "Server not found")
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    mountedRef.current = true
    if (!serverId) return
    const t = setTimeout(() => void loadServer(), 0)
    return () => {
      clearTimeout(t)
      mountedRef.current = false
    }
  }, [serverId, loadServer])

  // Auto-polling while transitioning states
  useEffect(() => {
    if (!serverId) return
    if (!server || !["STARTING", "STOPPING", "PROVISIONING", "VERIFYING"].includes(server.status)) return

    const interval = setInterval(async () => {
      try {
        const data = await apiFetch<ServerRecord>(`/api/servers/${serverId}`)
        if (mountedRef.current) setServer(data)
      } catch {
        // ignore polling error silently
      }
    }, 2500)

    return () => clearInterval(interval)
  }, [serverId, server?.status])

  const handleCheckHealth = async () => {
    setIsChecking(true)
    try {
      const updated = await apiFetch<ServerRecord>(`/api/servers/${serverId}/check`, {
        method: "POST",
      })
      setServer(updated)
    } catch {
      // Handled
    } finally {
      setIsChecking(false)
    }
  }

  const handleCredentialsSaved = async () => {
    await loadServer()
    try {
      const updated = await apiFetch<ServerRecord>(`/api/servers/${serverId}/check`, {
        method: "POST",
      })
      setServer(updated)
    } catch {
      // SSH still not reachable
    }
  }

  const confirmDisconnectServer = async () => {
    setIsDisconnecting(true)
    try {
      await apiFetch(`/api/servers/${serverId}`, {
        method: "DELETE",
      })
      router.push("/dashboard/servers")
    } catch {
      setIsDisconnecting(false)
    }
  }

  const runPowerAction = async (action: "pause" | "restart") => {
    setPowerAction(action)
    setError(null)
    try {
      const updated = await apiFetch<ServerRecord>(`/api/servers/${serverId}/${action}`, {
        method: "POST",
      })
      setServer(updated)
      setShowConfirmPause(false)
      setShowConfirmRestart(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} server`)
    } finally {
      setPowerAction(null)
    }
  }

  // ─── Loading state ───────────────────────────────────────────────
  if (isLoading && !server) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <Loader2 className="size-7 animate-spin text-brand" />
        <p className="mt-3 text-sm text-ink-muted">Loading server details...</p>
      </div>
    )
  }

  // ─── Error state ─────────────────────────────────────────────────
  if (error || !server) {
    return (
      <div className="rounded-[6px] border border-line bg-surface p-10 text-center shadow-card">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400">
          <AlertCircle className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink-strong">Server Not Found</h2>
        <p className="mt-1.5 max-w-md text-sm text-ink-muted">{error || "The requested server could not be found."}</p>
        <Link href="/dashboard/servers" className={`mt-6 inline-flex ${secondaryButton}`}>
          <ArrowLeft className="mr-2 size-4" /> Back to Servers
        </Link>
      </div>
    )
  }

  const ip = server.elasticIp || server.host || server.publicIp
  const isConnectable = server.status === "CONNECTED" && server.credentialsStored
  const isInTransition = ["STARTING", "STOPPING", "PROVISIONING", "VERIFYING"].includes(server.status)

  // ─── Main layout ─────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5">
      {/* Breadcrumb + back */}
      <Link
        href="/dashboard/servers"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink-default"
      >
        <ArrowLeft className="size-3" />
        Back to Servers
      </Link>

      {/* ═══════════ HEADER ═══════════ */}
      <div className="rounded-[6px] border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            {/* Server name & status row */}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-xl font-medium tracking-[-0.025em] text-ink-strong">
                {server.name}
              </h1>
              <StatusDot status={server.status} />
            </div>

            {/* IP & provider meta line */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
              {ip && (
                <span className="flex items-center gap-1.5 font-mono text-xs">
                  <Wifi className="size-3.5 text-ink-muted/60" />
                  {ip}:{server.sshPort}
                </span>
              )}
              {server.provider && (
                <span className="flex items-center gap-1.5">
                  <ServerIcon className="size-3.5 text-ink-muted/60" />
                  {providerLabel(server.provider)}
                </span>
              )}
              {(server.osVersion || server.osType) && (
                <span className="flex items-center gap-1.5">
                  <Monitor className="size-3.5 text-ink-muted/60" />
                  {server.osVersion || server.osType}
                </span>
              )}
            </div>

            {/* Connected since */}
            <p className="mt-1.5 text-[11px] text-ink-muted/70">
              Added {new Date(server.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {server.lastCheckedAt && (
                <> · Checked {new Date(server.lastCheckedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>
              )}
            </p>
          </div>

          {/* Primary action row */}
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <Link
              href={`/dashboard/servers/${server.id}/monitoring`}
              className={`${secondaryButton} h-9`}
            >
              <Activity className="mr-2 size-4" aria-hidden />
              Monitoring
            </Link>
            {isConnectable ? (
              <Link
                href={`/dashboard/servers/${server.id}/terminal`}
                className={`${primaryButton} h-9`}
              >
                <Terminal className="mr-2 size-4" aria-hidden />
                Open Terminal
              </Link>
            ) : (
              <button
                disabled
                className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-[6px] bg-brand/30 px-4 text-xs font-semibold text-white/60"
              >
                <Terminal className="size-3.5" />
                Terminal Unavailable
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════ RESOURCE BAR ═══════════ */}
      <div className="rounded-[6px] border border-line bg-surface p-4 shadow-card">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            icon={Cpu}
            label="CPU"
            value={server.cpuInfo || "Detected"}
            accent={!!server.cpuInfo}
          />
          <StatTile
            icon={Maximize2}
            label="Memory"
            value={server.memoryMb ? `${Math.round(server.memoryMb / 1024)} GB` : "Detected"}
            accent={!!server.memoryMb}
          />
          <StatTile
            icon={HardDrive}
            label="Disk"
            value={server.diskGb ? `${server.diskGb} GB` : "Detected"}
            accent={!!server.diskGb}
          />
          <StatTile
            icon={server.dockerStatus === "INSTALLED" ? ShieldCheck : WifiOff}
            label="Docker"
            value={server.dockerStatus === "INSTALLED" ? "Installed" : "Not installed"}
            accent={server.dockerStatus === "INSTALLED"}
          />
        </div>

        {/* Additional row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Key className="size-3 text-ink-muted/60" />
            SSH: {server.sshUsername}@{ip ?? "—"}:{server.sshPort}
          </span>
          <span className="text-line-warm">·</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <ShieldCheck className="size-3 text-ink-muted/60" />
            {server.credentialsStored ? "AES-256-GCM encrypted" : "No stored credentials"}
          </span>
          <span className="text-line-warm">·</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Minimize2 className="size-3 text-ink-muted/60" />
            Sudo: {server.sudoStatus === "PASSWORDLESS" ? "Passwordless" : "Available"}
          </span>
        </div>
      </div>

      {/* ═══════════ In-transition progress bar ═══════════ */}
      {isInTransition && (
        <div className="rounded-[6px] border border-brand/20 bg-brand-soft/40 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-brand" />
              <span className="text-sm font-semibold text-brand">
                {server.status === "STARTING"
                  ? "Starting server..."
                  : server.status === "STOPPING"
                  ? "Stopping server..."
                  : server.status === "PROVISIONING"
                  ? "Provisioning..."
                  : "Verifying connection..."}
              </span>
            </div>
            <span className="rounded-[4px] border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-brand">
              In Progress
            </span>
          </div>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-brand/15">
            <div className="h-full w-full bg-brand animate-pulse rounded-full" />
          </div>
          <p className="mt-2 text-xs text-ink-muted leading-relaxed">
            {server.status === "STARTING"
              ? `Powering on compute and initializing SSH on port ${server.sshPort}.`
              : server.status === "STOPPING"
              ? "Gracefully stopping workloads and powering down."
              : "Connecting over SSH and verifying Docker & runtime health."}
          </p>
        </div>
      )}

      {/* ═══════════ ERROR ALERT ═══════════ */}
      {error && (
        <div className="rounded-[6px] border border-red-200/60 bg-red-50/60 px-4 py-3 text-xs font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ═══════════ PREPARE ALERT ═══════════ */}
      {prepareAlert && (
        <div className="rounded-[6px] border border-line-warm bg-canvas px-4 py-3 text-xs text-ink-default flex items-center justify-between shadow-card">
          <span>
            <strong className="font-semibold text-brand">Prepare Server</strong> workflow is coming soon. This will automatically install Docker, Nginx, SSL, and security hardening via SSH.
          </span>
          <button onClick={() => setPrepareAlert(false)} className="text-ink-muted hover:text-ink-strong">
            Dismiss
          </button>
        </div>
      )}

      {/* ═══════════ TWO-COLUMN INFO GRID ═══════════ */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left column: System Specs */}
        <div className="rounded-[6px] border border-line bg-surface p-5 shadow-card lg:col-span-5">
          <SectionHeader title="System Specifications" />
          <dl className="mt-3 divide-y divide-line">
            <SpecItem label="Operating System" value={server.osVersion || server.osType || "Ubuntu"} />
            <SpecItem label="OS Version" value={server.osVersion || "—"} mono />
            <SpecItem label="CPU" value={server.cpuInfo || "—"} />
            <SpecItem label="Memory" value={server.memoryMb ? `${server.memoryMb} MB (~${Math.round(server.memoryMb / 1024)} GB)` : "—"} />
            <SpecItem label="Disk" value={server.diskGb ? `${server.diskGb} GB` : "—"} />
            <SpecItem label="SSH Port" value={String(server.sshPort)} mono />
            <SpecItem label="SSH User" value={server.sshUsername} mono />
            <SpecItem label="Provider" value={providerLabel(server.provider)} />
            <SpecItem label="Docker" value={server.dockerStatus === "INSTALLED" ? "Installed ✓" : "Not installed"} />
            <SpecItem label="Sudo" value={server.sudoStatus === "PASSWORDLESS" ? "Passwordless ✓" : "Available"} />
            <SpecItem label="Encryption" value={server.credentialsStored ? "AES-256-GCM" : "Metadata only"} />
            <SpecItem label="Connected Since" value={new Date(server.createdAt).toLocaleDateString()} />
          </dl>
        </div>

        {/* Right column: Connection & Actions */}
        <div className="space-y-5 lg:col-span-7">
          {/* Monitoring card — full width of right col */}
          <MonitoringStatusCard serverId={server.id} />

          {/* Connection details */}
          <div className="rounded-[6px] border border-line bg-surface p-5 shadow-card">
            <SectionHeader title="Connection Details" />
            <div className="mt-3 space-y-2.5">
              {ip && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Public IP Address</span>
                  <span className="font-mono text-xs font-medium text-ink-strong">{ip}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">SSH Port</span>
                <span className="font-mono text-xs font-medium text-ink-strong">{server.sshPort}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">Authentication</span>
                <span className="text-xs text-ink-strong">
                  {server.credentialsStored ? (
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="size-3.5 text-emerald-600" />
                      AES-256-GCM Encrypted
                    </span>
                  ) : (
                    <span className="text-amber-600">Credentials not stored</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">Server ID</span>
                <span className="font-mono text-[11px] text-ink-muted">{server.id.slice(0, 8)}…</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-[6px] border border-line bg-surface p-5 shadow-card">
            <SectionHeader title="Actions" />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Link
                href={`/dashboard/servers/${server.id}/monitoring`}
                className="flex items-center justify-center gap-2 rounded-[6px] border border-line-warm bg-surface px-3 py-2.5 text-xs font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas"
              >
                <Activity className="size-3.5 text-ink-muted" />
                Monitoring
              </Link>
              <button
                onClick={() => setShowCredentials(true)}
                className={`flex items-center justify-center gap-2 rounded-[6px] border border-line-warm bg-surface px-3 py-2.5 text-xs font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas`}
              >
                <Key className="size-3.5 text-ink-muted" />
                Credentials
              </button>
              <button
                onClick={handleCheckHealth}
                disabled={isChecking}
                className={`flex items-center justify-center gap-2 rounded-[6px] border border-line-warm bg-surface px-3 py-2.5 text-xs font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas disabled:opacity-50`}
              >
                <RefreshCw className={`size-3.5 ${isChecking ? "animate-spin text-brand" : "text-ink-muted"}`} />
                Health Check
              </button>
              <button
                onClick={() => setPrepareAlert(true)}
                className={`flex items-center justify-center gap-2 rounded-[6px] border border-line-warm bg-surface px-3 py-2.5 text-xs font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas`}
              >
                <Wrench className="size-3.5 text-ink-muted" />
                Prepare
              </button>
              <button
                onClick={() => setShowConfirmPause(true)}
                disabled={!server.canPause || powerAction !== null}
                className={`flex items-center justify-center gap-2 rounded-[6px] border border-line-warm bg-surface px-3 py-2.5 text-xs font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas disabled:opacity-40`}
                title={server.pauseBlockedReason ?? "Pause server"}
              >
                <Pause className="size-3.5 text-ink-muted" />
                Pause
              </button>
              <button
                onClick={() => setShowConfirmRestart(true)}
                disabled={!server.canRestart || powerAction !== null}
                className={`flex items-center justify-center gap-2 rounded-[6px] border border-line-warm bg-surface px-3 py-2.5 text-xs font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas disabled:opacity-40`}
                title={server.restartBlockedReason ?? (server.status === "STOPPED" ? "Start server" : "Restart server")}
              >
                <Power className="size-3.5 text-ink-muted" />
                {server.status === "STOPPED" ? "Start" : "Restart"}
              </button>
              <button
                onClick={() => setShowConfirmDisconnect(true)}
                disabled={isDisconnecting}
                className={`flex items-center justify-center gap-2 rounded-[6px] border border-red-200/60 bg-red-50/40 px-3 py-2.5 text-xs font-medium text-red-700 transition-colors duration-150 ease-out hover:bg-red-100/60 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400`}
              >
                <Trash2 className="size-3.5" />
                Disconnect Server
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ MODALS ═══════════ */}
      <ConfirmModal
        open={showConfirmDisconnect}
        title="Disconnect server?"
        description={`Are you sure you want to disconnect "${server.name}" (${ip})? This cannot be undone.`}
        confirmText="Disconnect"
        cancelText="Cancel"
        variant="danger"
        isSubmitting={isDisconnecting}
        onConfirm={confirmDisconnectServer}
        onClose={() => setShowConfirmDisconnect(false)}
      />

      <ConfirmModal
        open={showConfirmPause}
        title="Pause server?"
        description={
          server.pauseBlockedReason ??
          `This will shut down "${server.name}".${
            server.pauseIsOneWay
              ? " TisiOps cannot start it again — you'll need to power on from your provider."
              : ""
          }`
        }
        confirmText="Pause"
        cancelText="Cancel"
        variant="warning"
        isSubmitting={powerAction === "pause"}
        onConfirm={() => void runPowerAction("pause")}
        onClose={() => setShowConfirmPause(false)}
      />

      <ConfirmModal
        open={showConfirmRestart}
        title={server.status === "STOPPED" ? "Start server?" : "Restart server?"}
        description={
          server.status === "STOPPED"
            ? `Starting "${server.name}". SSH and apps may take a minute.`
            : `Rebooting "${server.name}". Active sessions will be interrupted.`
        }
        confirmText={server.status === "STOPPED" ? "Start" : "Restart"}
        cancelText="Cancel"
        variant="warning"
        isSubmitting={powerAction === "restart"}
        onConfirm={() => void runPowerAction("restart")}
        onClose={() => setShowConfirmRestart(false)}
      />

      {showCredentials && (
        <SshCredentialsModal
          serverId={serverId}
          onClose={() => setShowCredentials(false)}
          onSaved={handleCredentialsSaved}
        />
      )}
    </div>
  )
}

/* ─── Sub-components ──────────────────────────────────────────────── */

function SpecItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`truncate text-right font-medium text-ink-strong ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  )
}
