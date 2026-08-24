"use client"

import {
  AlertCircle,
  ArrowLeft,
  Key,
  Loader2,
  Pause,
  Power,
  RefreshCw,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { ConfirmModal } from "@/components/dashboard/confirm-modal"
import { MonitoringStatusCard } from "@/components/dashboard/monitoring-status-card"
import { SshCredentialsModal } from "@/components/dashboard/ssh-credentials-modal"
import { apiFetch } from "@/lib/api"
import { primaryButton, secondaryButton } from "@/lib/ui"
import {
  formatStatus,
  StatusDot,
  type ServerRecord,
} from "@/components/dashboard/servers-view"

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

  const loadServer = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await apiFetch<ServerRecord>(`/api/servers/${serverId}`)
      setServer(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Server not found")
    } finally {
      setIsLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    if (!serverId) return
    const t = setTimeout(() => void loadServer(), 0)
    return () => clearTimeout(t)
  }, [serverId, loadServer])

  useEffect(() => {
    if (!serverId) return
    if (!server || !["STARTING", "STOPPING", "PROVISIONING", "VERIFYING"].includes(server.status)) {
      return
    }

    const interval = setInterval(async () => {
      try {
        const data = await apiFetch<ServerRecord>(`/api/servers/${serverId}`)
        setServer(data)
      } catch {
        // ignore polling error
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

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center">
        <Loader2 className="size-6 animate-spin text-brand" />
        <p className="mt-2 text-xs text-ink-muted">Loading server details...</p>
      </div>
    )
  }

  if (error || !server) {
    return (
      <div className="rounded-[6px] border border-line bg-surface p-8 text-center">
        <AlertCircle className="mx-auto size-8 text-amber-500" />
        <h2 className="mt-4 text-base font-semibold text-ink-strong">Server Not Found</h2>
        <p className="mt-1 text-sm text-ink-muted">{error || "The requested server could not be found."}</p>
        <Link href="/dashboard/servers" className={`mt-6 inline-flex ${secondaryButton}`}>
          <ArrowLeft className="mr-2 size-4" /> Back to Servers
        </Link>
      </div>
    )
  }

  const ip = server.elasticIp || server.host || server.publicIp
  const isConnectable = server.status === "CONNECTED" && server.credentialsStored

  return (
    <div className="space-y-5 max-w-[1200px]">
      {/* Back */}
      <Link
        href="/dashboard/servers"
        className="inline-flex items-center text-xs font-medium text-ink-muted hover:text-ink-strong"
      >
        <ArrowLeft className="mr-1.5 size-3" />
        Back to Servers
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-medium tracking-[-0.02em] text-ink-strong">
              {server.name}
            </h1>
            <StatusDot status={server.status} />
            <span className="text-xs text-ink-muted">{formatStatus(server.status)}</span>
          </div>
          <p className="mt-1 font-mono text-xs text-ink-muted">
            {ip} :{server.sshPort}
          </p>
        </div>

        {/* Action buttons - compact row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {isConnectable ? (
            <Link
              href={`/dashboard/servers/${server.id}/terminal`}
              className={`inline-flex h-8 items-center gap-1.5 rounded-[4px] px-3 text-xs font-semibold text-white transition-colors ${primaryButton}`}
            >
              <Terminal className="size-3.5" />
              Terminal
            </Link>
          ) : (
            <button
              disabled
              className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-brand/40 px-3 text-xs font-semibold text-white/70 cursor-not-allowed"
            >
              <Terminal className="size-3.5" />
              Terminal
            </button>
          )}

          <button
            onClick={() => setShowCredentials(true)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-line bg-surface px-2.5 text-xs font-medium text-ink-default transition-colors hover:bg-canvas ${secondaryButton}`}
          >
            <Key className="size-3.5 text-ink-muted" />
            Credentials
          </button>

          <button
            onClick={handleCheckHealth}
            disabled={isChecking}
            className={`inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-line bg-surface px-2.5 text-xs font-medium text-ink-default transition-colors hover:bg-canvas ${secondaryButton}`}
          >
            <RefreshCw className={`size-3.5 ${isChecking ? "animate-spin text-brand" : "text-ink-muted"}`} />
            Health
          </button>

          <button
            onClick={() => setPrepareAlert(true)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-line bg-surface px-2.5 text-xs font-medium text-ink-default transition-colors hover:bg-canvas ${secondaryButton}`}
          >
            <Wrench className="size-3.5 text-ink-muted" />
            Prepare
          </button>

          <div className="mx-1 h-5 w-px bg-line" />

          <button
            onClick={() => setShowConfirmPause(true)}
            disabled={!server.canPause || powerAction !== null}
            className={`inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-line bg-surface px-2.5 text-xs font-medium text-ink-default transition-colors hover:bg-canvas disabled:opacity-40 ${secondaryButton}`}
            title={server.pauseBlockedReason ?? "Pause server"}
          >
            <Pause className="size-3.5 text-ink-muted" />
            Pause
          </button>

          <button
            onClick={() => setShowConfirmRestart(true)}
            disabled={!server.canRestart || powerAction !== null}
            className={`inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-line bg-surface px-2.5 text-xs font-medium text-ink-default transition-colors hover:bg-canvas disabled:opacity-40 ${secondaryButton}`}
            title={server.restartBlockedReason ?? (server.status === "STOPPED" ? "Start server" : "Restart server")}
          >
            <Power className="size-3.5 text-ink-muted" />
            {server.status === "STOPPED" ? "Start" : "Restart"}
          </button>

          <div className="mx-1 h-5 w-px bg-line" />

          <button
            onClick={() => setShowConfirmDisconnect(true)}
            disabled={isDisconnecting}
            className={`inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-red-200 bg-red-50/50 px-2.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400 ${secondaryButton}`}
          >
            <Trash2 className="size-3.5" />
            Disconnect
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-[4px] border border-[#f0d3cc] bg-[#fdf4f2] px-3 py-2 text-xs font-medium text-[#a8341f] dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {prepareAlert && (
        <div className="rounded-[4px] border border-line-warm bg-canvas px-4 py-3 text-xs text-ink-default flex items-center justify-between">
          <span>
            <strong className="font-semibold text-brand">Prepare Server</strong> workflow is coming soon. This will automatically install Docker, Nginx, SSL, and security hardening.
          </span>
          <button onClick={() => setPrepareAlert(false)} className="text-ink-muted hover:text-ink-strong">
            Dismiss
          </button>
        </div>
      )}

      {/* In-transition progress */}
      {["STARTING", "STOPPING", "PROVISIONING", "VERIFYING"].includes(server.status) && (
        <div className="rounded-[4px] border border-brand/20 bg-brand-soft/30 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin text-brand" />
              <span className="font-semibold text-brand">
                {server.status === "STARTING"
                  ? "Starting..."
                  : server.status === "STOPPING"
                  ? "Stopping..."
                  : server.status === "PROVISIONING"
                  ? "Provisioning..."
                  : "Verifying..."}
              </span>
            </div>
            <span className="font-mono text-[10px] text-brand/70">polling</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand/10">
            <div className="h-full w-full bg-brand animate-pulse rounded-full" />
          </div>
          <p className="text-xs text-ink-muted leading-relaxed">
            {server.status === "STARTING"
              ? `Powering on compute and initializing SSH on port ${server.sshPort}.`
              : server.status === "STOPPING"
              ? "Gracefully stopping workloads and powering down."
              : "Connecting over SSH and verifying Docker & runtime health."}
          </p>
        </div>
      )}

      {/* Monitoring */}
      <MonitoringStatusCard serverId={server.id} />

      {/* Details grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-5">
        {/* System Specs - compact table style */}
        <div className="rounded-[4px] border border-line bg-surface p-4 md:col-span-3">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            System Specs
          </h2>
          <div className="space-y-2.5 text-xs">
            <SpecRow label="OS" value={server.osVersion || server.osType || "Ubuntu"} />
            <SpecRow label="CPU" value={server.cpuInfo || "Detected"} />
            <SpecRow label="Memory" value={server.memoryMb ? `${server.memoryMb} MB` : "Detected"} />
            <SpecRow label="Disk" value={server.diskGb ? `${server.diskGb} GB` : "Detected"} />
            <SpecRow label="Docker" value={server.dockerStatus === "INSTALLED" ? "Installed" : "Not installed"} />
            <SpecRow label="Sudo" value={server.sudoStatus === "PASSWORDLESS" ? "Passwordless" : "Available"} />
          </div>
        </div>

        {/* Connection Info */}
        <div className="rounded-[4px] border border-line bg-surface p-4 md:col-span-2">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Connection
          </h2>
          <div className="space-y-2.5 text-xs">
            <SpecRow label="Provider" value={server.provider} />
            <SpecRow label="SSH User" value={server.sshUsername} mono />
            <SpecRow label="Port" value={String(server.sshPort)} mono />
            <SpecRow label="Encryption" value={server.credentialsStored ? "AES-256-GCM" : "Metadata only"} />
            <SpecRow label="Connected" value={new Date(server.createdAt).toLocaleDateString()} />
          </div>
        </div>
      </div>

      {/* Modals */}
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

      {showCredentials ? (
        <SshCredentialsModal
          serverId={serverId}
          onClose={() => setShowCredentials(false)}
          onSaved={handleCredentialsSaved}
        />
      ) : null}
    </div>
  )
}

function SpecRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-muted">{label}</span>
      <span className={`text-right font-medium text-ink-strong ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  )
}