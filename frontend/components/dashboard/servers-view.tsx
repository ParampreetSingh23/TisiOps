"use client"

import {
  Check,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { ConfirmModal } from "@/components/dashboard/confirm-modal"
import { ConnectServerModal } from "@/components/dashboard/connect-server-modal"
import { OsIcon } from "@/components/dashboard/os-icon"
import { ServerStack } from "@/components/dashboard/server-stack"
import { ProviderIcon } from "@/components/deployment/provider-icon"
import { apiFetch } from "@/lib/api"
import { primaryButton } from "@/lib/ui"

export type ServerRecord = {
  id: string
  userId: string
  name: string
  provider: string
  host: string
  publicIp?: string
  elasticIp?: string
  sshPort: number
  sshUsername: string
  osType?: string
  osVersion?: string
  dockerStatus?: string
  sudoStatus?: string
  cpuInfo?: string
  memoryMb?: number
  diskGb?: number
  status:
    | "CONNECTED"
    | "VERIFYING"
    | "NEEDS_ATTENTION"
    | "UNREACHABLE"
    | "DISCONNECTED"
    | "READY"
    | "PROVISIONING"
    | "STARTING"
    | "STOPPED"
    | "STOPPING"
    | "TERMINATED"
  credentialsStored: boolean
  canPause?: boolean
  canRestart?: boolean
  pauseBlockedReason?: string | null
  restartBlockedReason?: string | null
  pauseIsOneWay?: boolean
  lastCheckedAt?: string
  createdAt: string
  updatedAt: string
}

export function formatStatus(status: string): string {
  if (status === "NEEDS_ATTENTION") return "Needs Attention"
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
}

export function StatusDot({ status }: { status: string }) {
  const isOk = status === "CONNECTED" || status === "READY"
  const isTransitioning =
    status === "STARTING" ||
    status === "STOPPING" ||
    status === "PROVISIONING" ||
    status === "VERIFYING"
  const isWarning = status === "NEEDS_ATTENTION"
  const isErr = status === "UNREACHABLE" || status === "FAILED"

  const dotColor = isOk
    ? "bg-emerald-500"
    : isTransitioning
    ? "bg-brand animate-pulse"
    : isWarning
    ? "bg-amber-500 animate-pulse"
    : isErr
    ? "bg-red-500"
    : "bg-ink-muted/50"

  const textColor = isTransitioning ? "text-brand font-semibold" : "text-ink-muted"

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${textColor}`}>
      <span className={`size-2 rounded-full ${dotColor}`} />
      {formatStatus(status)}
    </span>
  )
}

export function ServersView() {
  const searchParams = useSearchParams()
  const [servers, setServers] = useState<ServerRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [checkingId, setCheckingId] = useState<string | null>(null)

  // Custom Delete Confirm Modal state
  const [deleteTarget, setDeleteTarget] = useState<ServerRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [copiedHost, setCopiedHost] = useState<string | null>(null)
  const [showTerminated, setShowTerminated] = useState(false)

  const loadServers = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await apiFetch<ServerRecord[]>("/api/servers")
      setServers(data || [])
    } catch {
      setServers([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadServers()
  }, [loadServers])

  // Automatically poll server state when any server is in a transition state
  useEffect(() => {
    const hasTransitioning = servers.some((s) =>
      ["STARTING", "STOPPING", "PROVISIONING", "VERIFYING"].includes(s.status)
    )
    if (!hasTransitioning) return

    const interval = setInterval(async () => {
      try {
        const data = await apiFetch<ServerRecord[]>("/api/servers")
        setServers(data || [])
      } catch {
        // ignore polling error
      }
    }, 2500)

    return () => clearInterval(interval)
  }, [servers])

  useEffect(() => {
    if (searchParams.get("connect") === "true") {
      setIsModalOpen(true)
    }
  }, [searchParams])

  const handleCheckHealth = async (serverId: string) => {
    setCheckingId(serverId)
    try {
      const updated = await apiFetch<ServerRecord>(`/api/servers/${serverId}/check`, {
        method: "POST",
      })
      setServers((prev) => prev.map((s) => (s.id === serverId ? updated : s)))
    } catch (err) {
      // Handled silently or via state
    } finally {
      setCheckingId(null)
    }
  }

  const confirmDeleteServer = async () => {
    if (!deleteTarget) return

    setIsDeleting(true)
    try {
      await apiFetch(`/api/servers/${deleteTarget.id}`, {
        method: "DELETE",
      })
      setServers((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      // Handled silently
    } finally {
      setIsDeleting(false)
    }
  }

  const copyIp = (ip: string) => {
    navigator.clipboard.writeText(ip)
    setCopiedHost(ip)
    setTimeout(() => setCopiedHost(null), 2000)
  }

  const visibleServers = servers.filter((s) =>
    showTerminated ? true : s.status !== "TERMINATED"
  )
  const terminatedCount = servers.filter((s) => s.status === "TERMINATED").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink-strong">
            Servers
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Connect and manage servers used by your TisiOps AI DevOps workflows.
          </p>
        </div>

        <button onClick={() => setIsModalOpen(true)} className={primaryButton}>
          <Plus className="mr-1.5 size-4" aria-hidden />
          Connect Server
        </button>
      </div>

      {/* Sub-header bar */}
      {!isLoading && servers.length > 0 && terminatedCount > 0 && (
        <div className="flex items-center justify-between border-b border-line pb-3 text-xs text-ink-muted">
          <span>Showing {visibleServers.length} active/connected servers</span>
          <button
            onClick={() => setShowTerminated(!showTerminated)}
            className="font-medium text-brand hover:underline"
          >
            {showTerminated ? "Hide terminated servers" : `Show ${terminatedCount} terminated server(s)`}
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center">
          <Loader2 className="size-6 animate-spin text-brand" />
          <p className="mt-2 text-xs text-ink-muted">Loading connected servers...</p>
        </div>
      ) : visibleServers.length === 0 ? (
        /* Empty State */
        <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-lg border border-line bg-surface py-16 text-center shadow-card">
          <ServerStack className="w-40 text-ink-muted/40" />
          <h3 className="mt-6 text-base font-semibold text-ink-strong">
            No servers connected yet
          </h3>
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            Connect your own Ubuntu server or use a TisiOps managed server to run apps, templates, databases, and DevOps workflows.
          </p>
          <button onClick={() => setIsModalOpen(true)} className={`mt-6 ${primaryButton}`}>
            <Plus className="mr-1.5 size-4" />
            Connect Server
          </button>
        </div>
      ) : (
        /* Clean Servers Grid - No Badge Clutter */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleServers.map((server) => {
            const isChecking = checkingId === server.id
            const ipDisplay = server.elasticIp || server.host || server.publicIp || "N/A"

            return (
              <div
                key={server.id}
                className="group flex flex-col justify-between rounded-lg border border-line bg-surface p-5 shadow-card transition-all duration-150 ease-out hover:border-line-warm"
              >
                <div>
                  {/* Header: Name & Status Dot */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-heading text-base font-semibold text-ink-strong" title={server.name}>
                        {server.name}
                      </h3>
                      <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-ink-muted">
                        <span>{ipDisplay}</span>
                        {ipDisplay !== "N/A" && (
                          <button
                            onClick={() => copyIp(ipDisplay)}
                            className="rounded p-0.5 text-ink-muted hover:bg-canvas hover:text-ink-strong"
                            title="Copy IP"
                          >
                            {copiedHost === ipDisplay ? (
                              <Check className="size-3 text-emerald-600" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <StatusDot status={server.status} />
                  </div>

                  {/* Clean Text Metadata Row (No AI-style pill borders) */}
                  <div className="mt-4 flex items-center gap-4 text-xs text-ink-muted border-t border-line/50 pt-3">
                    <div className="flex items-center gap-1.5">
                      <ProviderIcon id={server.provider.toLowerCase().replace("_", "-")} className="size-3.5" />
                      <span className="font-medium text-ink-default">{server.provider}</span>
                    </div>

                    <span className="text-line-warm">•</span>

                    <div className="flex items-center gap-1.5">
                      <OsIcon os={server.osVersion || server.osType} className="size-3.5" />
                      <span className="text-ink-default">{server.osVersion || server.osType || "Ubuntu"}</span>
                    </div>
                  </div>

                  {/* System Overview */}
                  <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
                    <span>Docker: <strong className="font-medium text-ink-strong">{server.dockerStatus === "INSTALLED" ? "Installed" : "Not installed"}</strong></span>
                    <span>Sudo: <strong className="font-medium text-ink-strong">{server.sudoStatus === "PASSWORDLESS" ? "Passwordless" : "Available"}</strong></span>
                  </div>

                  {/* In-transition Orange Progress Bar */}
                  {["STARTING", "STOPPING", "PROVISIONING", "VERIFYING"].includes(server.status) && (
                    <div className="mt-3 space-y-1.5 rounded-[6px] border border-brand/20 bg-brand-soft/30 p-2.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-brand">
                          {server.status === "STARTING"
                            ? "Starting server..."
                            : server.status === "STOPPING"
                            ? "Stopping server..."
                            : server.status === "PROVISIONING"
                            ? "Provisioning..."
                            : "Verifying..."}
                        </span>
                        <span className="font-mono text-[10px] text-brand">In progress</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand/15">
                        <div className="h-full w-full bg-brand animate-pulse rounded-full" />
                      </div>
                    </div>
                  )}

                  {/* Last Checked */}
                  {server.lastCheckedAt && (
                    <p className="mt-3 text-[11px] text-ink-muted/80">
                      Last checked: {new Date(server.lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-5 flex items-center justify-between border-t border-line/60 pt-3">
                  <Link
                    href={`/dashboard/servers/${server.id}`}
                    className="text-xs font-semibold text-brand transition-colors hover:underline"
                  >
                    View Server →
                  </Link>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCheckHealth(server.id)}
                      disabled={isChecking}
                      className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-line-warm bg-surface px-2.5 text-xs font-medium text-ink-default hover:bg-canvas disabled:opacity-50"
                      title="Re-check health"
                    >
                      <RefreshCw className={`size-3 ${isChecking ? "animate-spin text-brand" : ""}`} />
                      <span>Health</span>
                    </button>

                    <button
                      onClick={() => setDeleteTarget(server)}
                      className="inline-flex size-8 items-center justify-center rounded-[6px] border border-line-warm bg-surface text-ink-muted hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-900/40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      title="Remove server"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Custom Theme-Matched Confirmation Modal */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Disconnect server?"
        description={`Are you sure you want to remove server "${deleteTarget?.name}" (${deleteTarget?.elasticIp || deleteTarget?.host || deleteTarget?.publicIp})? This will disconnect the server from your TisiOps workspace.`}
        confirmText="Disconnect Server"
        cancelText="Cancel"
        variant="danger"
        isSubmitting={isDeleting}
        onConfirm={confirmDeleteServer}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Connect Server Wizard Modal */}
      <ConnectServerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onServerCreated={loadServers}
      />
    </div>
  )
}
