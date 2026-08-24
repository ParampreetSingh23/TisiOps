"use client"

import { ArrowRight, Loader2 } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { ConfirmModal } from "@/components/dashboard/confirm-modal"
import { SshCredentialsModal } from "@/components/dashboard/ssh-credentials-modal"
import { apiFetch } from "@/lib/api"
import { primaryButton, secondaryButton } from "@/lib/ui"

export type MonitoringRecord = {
  serverId: string
  status:
    | "NOT_INSTALLED"
    | "INSTALLING"
    | "ACTIVE"
    | "FAILED"
    | "DISABLED"
    | "UPGRADING"
  agentVersion: string | null
  installPath: string | null
  installedAt: string | null
  lastHeartbeatAt: string | null
  lastCheckedAt: string | null
  errorCode: string | null
  errorMessage: string | null
}

const BADGE_STYLES: Record<string, string> = {
  ACTIVE: "border-[#cfe6dc] bg-[#f2f9f6] text-[#0f6b4f]",
  INSTALLING: "border-brand bg-brand-soft text-brand",
  UPGRADING: "border-brand bg-brand-soft text-brand",
  FAILED: "border-[#f0d3cc] bg-[#fdf4f2] text-[#a8341f]",
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

const STATUS_MESSAGES: Record<string, string> = {
  NOT_INSTALLED: "Monitoring is not installed on this server yet.",
  INSTALLING: "Monitoring setup is in progress.",
  ACTIVE: "Monitoring is active.",
  FAILED: "Monitoring setup failed.",
  DISABLED: "Monitoring is disabled.",
  UPGRADING: "Monitoring is upgrading.",
}

export function MonitoringStatusCard({ serverId }: { serverId: string }) {
  const [monitoring, setMonitoring] = useState<MonitoringRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<"enable" | "retry" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCredentials, setShowCredentials] = useState(false)

  const load = useCallback(async () => {
    try {
      const next = await apiFetch<MonitoringRecord>(
        `/api/servers/${serverId}/monitoring`
      )
      setMonitoring(next)
    } catch {
      setError("Could not load monitoring status.")
    }
  }, [serverId])

  useEffect(() => {
    void load()
  }, [load])

  const inFlight = monitoring?.status === "INSTALLING" || monitoring?.status === "UPGRADING"
  useEffect(() => {
    if (!inFlight) return
    const timer = setInterval(() => {
      if (!document.hidden) void load()
    }, 10_000)
    return () => clearInterval(timer)
  }, [inFlight, load])

  const handleEnable = async () => {
    setIsSubmitting(true)
    try {
      await apiFetch(`/api/servers/${serverId}/monitoring/enable`, {
        method: "POST",
      })
      await load()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not enable monitoring."
      )
    } finally {
      setIsSubmitting(false)
      setModal(null)
    }
  }

  const status = monitoring?.status ?? "NOT_INSTALLED"
  const isMissingCredentials =
    status === "FAILED" &&
    monitoring?.errorCode === "SSH_AUTH_FAILED" &&
    /no stored ssh credentials/i.test(monitoring?.errorMessage ?? "")

  const button = (() => {
    switch (status) {
      case "ACTIVE":
        return (
          <Link
            href={`/dashboard/servers/${serverId}/monitoring`}
            className={primaryButton}
          >
            View Monitoring
            <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
          </Link>
        )
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
        return isMissingCredentials ? (
          <button
            onClick={() => setShowCredentials(true)}
            className={primaryButton}
          >
            Add SSH Credentials
          </button>
        ) : (
          <button
            onClick={() => setModal("retry")}
            className={secondaryButton}
          >
            Retry Setup
          </button>
        )
      case "DISABLED":
        return (
          <button
            onClick={() => setModal("enable")}
            className={primaryButton}
          >
            Enable Monitoring
          </button>
        )
      default:
        return (
          <button
            onClick={() => setModal("enable")}
            className={primaryButton}
          >
            Monitor Server
          </button>
        )
    }
  })()

  const inProgress = status === "INSTALLING" || status === "UPGRADING"

  return (
    <section className="rounded-[6px] border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Monitoring
        </h2>
        {monitoring ? (
          <span
            className={`rounded-[3px] border px-1.5 py-0.5 text-[10px] font-semibold ${
              BADGE_STYLES[status] ?? BADGE_STYLES.NOT_INSTALLED
            }`}
          >
            {BADGE_LABELS[status] ?? BADGE_LABELS.NOT_INSTALLED}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-xs text-ink-muted">{error}</p>
      ) : !monitoring ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
          <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden />
          Loading…
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-ink-default">
            {STATUS_MESSAGES[status] ?? STATUS_MESSAGES.NOT_INSTALLED}
          </p>

          {inProgress ? (
            <p className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-muted">
              <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden />
              Configuring…
            </p>
          ) : null}

          {status === "ACTIVE" && monitoring.agentVersion ? (
            <p className="mt-1 text-[10px] text-ink-muted">
              Agent v{monitoring.agentVersion}
            </p>
          ) : null}

          {status === "FAILED" && monitoring.errorMessage ? (
            <p className="mt-1 text-[10px] text-ink-muted">
              {monitoring.errorMessage}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">{button}</div>
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
            ? "TisiOps will retry preparing this server for monitoring."
            : "TisiOps will prepare this server for monitoring so CPU, memory, disk, Docker, and service health can be tracked."
        }
        confirmText={modal === "retry" ? "Retry Setup" : "Enable Monitoring"}
        cancelText="Cancel"
        variant="default"
        isSubmitting={isSubmitting}
        onConfirm={() => void handleEnable()}
        onClose={() => setModal(null)}
      />

      {showCredentials ? (
        <SshCredentialsModal
          serverId={serverId}
          onClose={() => setShowCredentials(false)}
          onSaved={() => {
            void handleEnable()
          }}
        />
      ) : null}
    </section>
  )
}
