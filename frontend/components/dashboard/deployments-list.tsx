"use client"

import {
  ArrowRight,
  ExternalLink,
  Loader2,
  Rocket,
  RotateCw,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { apiFetch } from "@/lib/api"
import { ProviderIcon } from "@/components/deployment/provider-icon"
import { card, primaryButton } from "@/lib/ui"

/** Row actions: smaller than a form button, still a real target. */
const compactButton =
  "inline-flex h-8 items-center justify-center rounded-[6px] border border-line-warm bg-surface px-3 text-xs font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted"
import type { SafeDeployment } from "@tisiops/server/services/deployments"

/** Only ever renders the signed-in user's deployments — the API scopes them. */

export const STATUS_STYLES: Record<string, string> = {
  LIVE: "border-[#cfe6dc] bg-[#f2f9f6] text-[#0f6b4f]",
  BUILDING: "border-brand bg-brand-soft text-brand",
  RETRYING: "border-brand bg-brand-soft text-brand",
  CANCELLED: "border-line-warm bg-canvas text-ink-muted",
  PREPARING: "border-line-warm bg-canvas text-ink-muted",
  FAILED: "border-[#f0d3cc] bg-[#fdf4f2] text-[#a8341f]",
  PLACEHOLDER: "border-line-warm bg-canvas text-ink-muted",
  ACCESS_BLOCKED: "border-[#f0d3cc] bg-[#fdf4f2] text-[#a8341f]",
}

const STATUS_DOTS: Record<string, string> = {
  LIVE: "bg-[#0f6b4f]",
  BUILDING: "bg-brand",
  RETRYING: "bg-brand",
  PREPARING: "bg-line-warm",
  FAILED: "bg-[#a8341f]",
  CANCELLED: "bg-line-warm",
  ACCESS_BLOCKED: "bg-[#a8641f]",
  PLACEHOLDER: "bg-line-warm",
}

export function statusLabel(status: string): string {
  return status === "ACCESS_BLOCKED"
    ? "Access blocked"
    : status.charAt(0) + status.slice(1).toLowerCase()
}

/** Quieter than a pill, which turned every row into a warning. */
export function StatusDot({ status }: { status: string }) {
  const running = status === "BUILDING" || status === "RETRYING"

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-default">
      <span
        className={`size-1.5 shrink-0 rounded-full ${STATUS_DOTS[status] ?? "bg-line-warm"} ${
          running ? "motion-safe:animate-pulse" : ""
        }`}
        aria-hidden
      />
      {statusLabel(status)}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-[4px] border px-2 py-0.5 text-xs font-semibold ${
        STATUS_STYLES[status] ?? STATUS_STYLES.PREPARING
      }`}
    >
      {status === "ACCESS_BLOCKED"
        ? "Access blocked"
        : status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString()
}

export function DeploymentsList() {
  const [deployments, setDeployments] = useState<SafeDeployment[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    apiFetch<SafeDeployment[]>("/api/deployments")
      .then((list) => {
        if (active) setDeployments(list)
      })
      .catch(() => {
        if (active) setError("Could not load your deployments.")
      })

    return () => {
      active = false
    }
  }, [])

  if (error) {
    return (
      <p role="alert" className={`${card} text-sm text-[#a8341f]`}>
        {error}
      </p>
    )
  }

  if (!deployments) {
    return (
      <p className={`${card} flex items-center gap-3 text-sm text-ink-muted`}>
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        Loading deployments…
      </p>
    )
  }

  if (deployments.length === 0) {
    return (
      <div className={`${card} text-center`}>
        <span className="mx-auto flex size-11 items-center justify-center rounded-[8px] bg-canvas text-ink-muted">
          <Rocket className="size-5" aria-hidden />
        </span>
        <h2 className="mt-3 text-sm font-semibold tracking-[-0.01em] text-ink-strong">
          No deployments yet
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Start one from the AI Console or the Vercel Frontend template.
        </p>
        <Link
          href="/dashboard/new-deployment/vercel"
          className={`mt-5 ${primaryButton}`}
        >
          Create deployment
        </Link>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {deployments.map((deployment) => {
        const isLive = deployment.status === "LIVE"

        return (
          <li
            key={deployment.id}
            className={`${card} transition-colors duration-150 ease-out hover:border-line-warm`}
          >
            <div className="flex items-start gap-4">
              {/* The provider is what the row *is*, so it anchors the card. */}
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[6px] border border-line bg-canvas">
                <ProviderIcon id={deployment.type.toLowerCase()} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/dashboard/deployments/${deployment.id}`}
                    className="font-heading text-base font-semibold tracking-[-0.01em] text-ink-strong hover:text-brand"
                  >
                    {deployment.appName}
                  </Link>
                  <StatusDot status={deployment.status} />
                  <span className="ml-auto shrink-0 text-xs text-ink-muted">
                    {formatDateTime(deployment.createdAt)}
                  </span>
                </div>

                <p className="mt-1 truncate font-mono text-xs text-ink-muted">
                  {deployment.repositoryOwner}/{deployment.repositoryName}
                  <span className="mx-1.5 text-line-warm">/</span>
                  {deployment.branch}
                  {deployment.servicePath ? (
                    <>
                      <span className="mx-1.5 text-line-warm">/</span>
                      {deployment.servicePath}
                    </>
                  ) : null}
                </p>

                {deployment.previewUrl ? (
                  isLive ? (
                    <a
                      href={deployment.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex max-w-full items-center gap-1.5 font-mono text-xs text-brand hover:text-brand-hover"
                    >
                      <span className="truncate">
                        {deployment.previewUrl.replace(/^https:\/\//, "")}
                      </span>
                      <ExternalLink className="size-3 shrink-0" aria-hidden />
                    </a>
                  ) : (
                    // Shown but not offered as a link: the build failed or the
                    // URL is gated, so clicking it would only disappoint.
                    <p className="mt-2 truncate font-mono text-xs text-ink-muted">
                      {deployment.previewUrl.replace(/^https:\/\//, "")}
                    </p>
                  )
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Link
                    href={`/dashboard/deployments/${deployment.id}`}
                    className={compactButton}
                  >
                    Details
                    <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
                  </Link>
                  <Link
                    href={`/dashboard/logs?deployment=${deployment.id}`}
                    className={compactButton}
                  >
                    Logs
                  </Link>
                  {deployment.canRetry ? (
                    <Link
                      href={`/dashboard/deployments/${deployment.id}`}
                      className={compactButton}
                    >
                      <RotateCw className="mr-1.5 size-3.5" aria-hidden />
                      Retry
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
