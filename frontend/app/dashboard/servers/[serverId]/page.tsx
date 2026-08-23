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

  // Automatically poll server state when in a transition state (STARTING, STOPPING, PROVISIONING, VERIFYING)
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

  // After adding credentials: refresh the server record and run a health check
  // so status flips to CONNECTED (enabling the terminal) and SSH is confirmed.
  const handleCredentialsSaved = async () => {
    await loadServer()
    try {
      const updated = await apiFetch<ServerRecord>(`/api/servers/${serverId}/check`, {
        method: "POST",
      })
      setServer(updated)
    } catch {
      // SSH still not reachable — status stays non-CONNECTED.
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
      <div className="rounded-lg border border-line bg-surface p-8 text-center shadow-card">
        <AlertCircle className="mx-auto size-8 text-amber-500" />
        <h2 className="mt-4 font-heading text-lg font-semibold text-ink-strong">Server Not Found</h2>
        <p className="mt-1 text-sm text-ink-muted">{error || "The requested server could not be found."}</p>
        <Link href="/dashboard/servers" className={`mt-6 inline-flex ${secondaryButton}`}>
          <ArrowLeft className="mr-2 size-4" /> Back to Servers
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Back Button */}
      <Link
        href="/dashboard/servers"
        className="inline-flex items-center text-xs font-medium text-ink-muted hover:text-ink-strong"
      >
        <ArrowLeft className="mr-1.5 size-3.5" />
        Back to Servers
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-line pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink-strong">
              {server.name}
            </h1>
            <StatusDot status={server.status} />
          </div>
          <p className="mt-1 font-mono text-sm text-ink-muted">
            {server.elasticIp || server.host || server.publicIp} (Port {server.sshPort})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {server.status === "CONNECTED" && server.credentialsStored ? (
            <Link
              href={`/dashboard/servers/${server.id}/terminal`}
              className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-brand px-3.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-brand-hover active:bg-brand-active"
            >
              <Terminal className="size-3.5" />
              <span>Open SSH Terminal</span>
            </Link>
          ) : (
            <button
              disabled
              className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-brand/50 px-3.5 text-xs font-semibold text-white cursor-not-allowed opacity-60"
              title="Server must be connected with stored SSH credentials."
            >
              <Terminal className="size-3.5" />
              <span>Open SSH Terminal</span>
            </button>
          )}

          <button
            onClick={() => setShowCredentials(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-line-warm bg-surface px-3 text-xs font-medium text-ink-default hover:bg-canvas transition-colors"
            title="Add or replace SSH credentials for this server"
          >
            <Key className="size-3.5 text-ink-muted" />
            <span>Credentials</span>
          </button>

          <button
            onClick={handleCheckHealth}
            disabled={isChecking}
            className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-line-warm bg-surface px-3 text-xs font-medium text-ink-default hover:bg-canvas transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${isChecking ? "animate-spin text-brand" : ""}`} />
            <span>Check Health</span>
          </button>

          <button
            onClick={() => setPrepareAlert(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-line-warm bg-surface px-3 text-xs font-medium text-ink-default hover:bg-canvas transition-colors"
          >
            <Wrench className="size-3.5 text-ink-muted" />
            <span>Prepare</span>
          </button>

          <button
            onClick={() => setShowConfirmPause(true)}
            disabled={!server.canPause || powerAction !== null}
            className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-line-warm bg-surface px-3 text-xs font-medium text-ink-default hover:bg-canvas transition-colors disabled:opacity-40"
            title={server.pauseBlockedReason ?? "Pause server"}
          >
            <Pause className="size-3.5 text-ink-muted" />
            <span>Pause</span>
          </button>

          <button
            onClick={() => setShowConfirmRestart(true)}
            disabled={!server.canRestart || powerAction !== null}
            className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-line-warm bg-surface px-3 text-xs font-medium text-ink-default hover:bg-canvas transition-colors disabled:opacity-40"
            title={
              server.restartBlockedReason ??
              (server.status === "STOPPED" ? "Start server" : "Restart server")
            }
          >
            <Power className="size-3.5 text-ink-muted" />
            <span>{server.status === "STOPPED" ? "Start" : "Restart"}</span>
          </button>

          <button
            onClick={() => setShowConfirmDisconnect(true)}
            disabled={isDisconnecting}
            className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-red-200 bg-red-50/50 px-3 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400 transition-colors"
          >
            <Trash2 className="size-3.5" />
            <span>Disconnect</span>
          </button>
        </div>

        {/* A stopped server that TisiOps cannot start looks like a broken
            button unless the page says why, and says what to do instead. */}
        {server.status === "STOPPED" && server.restartBlockedReason ? (
          <p className="max-w-2xl text-sm leading-6 text-ink-muted">
            {server.restartBlockedReason}
          </p>
        ) : null}
      </div>

      {error && (
        <div className="rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] p-3 text-xs font-medium text-[#a8341f] dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {prepareAlert && (
        <div className="rounded-[6px] border border-line-warm bg-canvas p-4 text-xs text-ink-default flex items-center justify-between">
          <span>
            <strong className="font-semibold text-brand">Prepare Server</strong> workflow is coming soon. This will automatically install Docker, Nginx, SSL, and security hardening on your server.
          </span>
          <button
            onClick={() => setPrepareAlert(false)}
            className="text-ink-muted hover:text-ink-strong"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* In-transition Progress Card / Orange Progress Bar */}
      {["STARTING", "STOPPING", "PROVISIONING", "VERIFYING"].includes(server.status) && (
        <div className="rounded-[8px] border border-brand/30 bg-brand-soft/40 p-4 shadow-card space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-brand" />
              <span className="font-semibold text-brand">
                {server.status === "STARTING"
                  ? "Starting Server..."
                  : server.status === "STOPPING"
                  ? "Stopping Server..."
                  : server.status === "PROVISIONING"
                  ? "Provisioning Server Infrastructure..."
                  : "Verifying SSH Connection..."}
              </span>
            </div>
            <span className="font-mono text-[11px] text-brand font-medium">
              Live status polling
            </span>
          </div>

          {/* Orange Progress Bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-brand/15">
            <div className="h-full w-full bg-brand animate-pulse rounded-full" />
          </div>

          <p className="text-xs text-ink-muted leading-relaxed">
            {server.status === "STARTING"
              ? `Powering on compute and initializing SSH daemon on port ${server.sshPort}. This page will automatically update once the server is connected.`
              : server.status === "STOPPING"
              ? "Gracefully stopping container workloads and powering down compute."
              : "Connecting over SSH and verifying Docker & runtime health."}
          </p>
        </div>
      )}

      {/* Monitoring status (Phase 1: status only, no metrics/install yet) */}
      <MonitoringStatusCard serverId={server.id} />

      {/* Details Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Hardware & System */}
        <div className="rounded-lg border border-line bg-surface p-5 shadow-card md:col-span-2 space-y-4">
          <h2 className="font-heading text-base font-semibold text-ink-strong">
            System Specs
          </h2>

          <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-3">
            <div className="rounded-[6px] border border-line-warm/60 bg-canvas/40 p-3">
              <span className="text-ink-muted block mb-1">Operating System</span>
              <p className="font-semibold text-ink-strong text-sm">{server.osVersion || server.osType || "Ubuntu"}</p>
            </div>

            <div className="rounded-[6px] border border-line-warm/60 bg-canvas/40 p-3">
              <span className="text-ink-muted block mb-1">CPU Cores</span>
              <p className="font-semibold text-ink-strong text-sm">{server.cpuInfo || "Detected"}</p>
            </div>

            <div className="rounded-[6px] border border-line-warm/60 bg-canvas/40 p-3">
              <span className="text-ink-muted block mb-1">Memory (RAM)</span>
              <p className="font-semibold text-ink-strong text-sm">{server.memoryMb ? `${server.memoryMb} MB` : "Detected"}</p>
            </div>

            <div className="rounded-[6px] border border-line-warm/60 bg-canvas/40 p-3">
              <span className="text-ink-muted block mb-1">Disk Storage</span>
              <p className="font-semibold text-ink-strong text-sm">{server.diskGb ? `${server.diskGb} GB` : "Detected"}</p>
            </div>

            <div className="rounded-[6px] border border-line-warm/60 bg-canvas/40 p-3">
              <span className="text-ink-muted block mb-1">Docker Engine</span>
              <p className="font-semibold text-ink-strong text-sm">
                {server.dockerStatus === "INSTALLED" ? "Installed" : "Not Installed"}
              </p>
            </div>

            <div className="rounded-[6px] border border-line-warm/60 bg-canvas/40 p-3">
              <span className="text-ink-muted block mb-1">Sudo Access</span>
              <p className="font-semibold text-ink-strong text-sm">
                {server.sudoStatus === "PASSWORDLESS" ? "Passwordless Sudo" : "Available"}
              </p>
            </div>
          </div>
        </div>

        {/* SSH & Security Info */}
        <div className="rounded-lg border border-line bg-surface p-5 shadow-card space-y-4">
          <h2 className="font-heading text-base font-semibold text-ink-strong">
            Connection Info
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between border-b border-line-warm/40 pb-2">
              <span className="text-ink-muted">Provider:</span>
              <span className="font-medium text-ink-strong">{server.provider}</span>
            </div>
            <div className="flex justify-between border-b border-line-warm/40 pb-2">
              <span className="text-ink-muted">SSH Username:</span>
              <span className="font-mono text-ink-strong">{server.sshUsername}</span>
            </div>
            <div className="flex justify-between border-b border-line-warm/40 pb-2">
              <span className="text-ink-muted">SSH Port:</span>
              <span className="font-mono text-ink-strong">{server.sshPort}</span>
            </div>
            <div className="flex justify-between border-b border-line-warm/40 pb-2">
              <span className="text-ink-muted">Credentials Encrypted:</span>
              <span className="font-medium text-ink-strong">
                {server.credentialsStored ? "Yes (AES-256-GCM)" : "No (Metadata only)"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Connected At:</span>
              <span className="text-ink-strong">
                {new Date(server.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Disconnect Confirm Modal */}
      <ConfirmModal
        open={showConfirmDisconnect}
        title="Disconnect server?"
        description={`Are you sure you want to disconnect server "${server.name}" (${server.elasticIp || server.host || server.publicIp})? This action cannot be undone.`}
        confirmText="Disconnect Server"
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
          `This will shut down "${server.name}". Apps on it go offline.${
            server.pauseIsOneWay
              ? " TisiOps only reaches this server over SSH, so it cannot start it again — you will need to power it on from your provider dashboard."
              : ""
          }`
        }
        confirmText="Pause Server"
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
            ? `This will start "${server.name}" again. It may take a minute before SSH and apps are reachable.`
            : `This will reboot "${server.name}" over SSH. Active terminal sessions and running processes may be interrupted.`
        }
        confirmText={server.status === "STOPPED" ? "Start Server" : "Restart Server"}
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
