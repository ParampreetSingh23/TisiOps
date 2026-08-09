"use client"

import { AlertTriangle, RotateCw, X } from "lucide-react"
import { useEffect, useRef } from "react"

import { primaryButton, secondaryButton } from "@/lib/ui"

/**
 * Failure report for a deployment.
 *
 * The provider's message is machine output, so it is quoted verbatim in
 * monospace behind a rule rather than reflowed as prose — the same treatment
 * the AWS and Vercel identity readouts use, so failures read as evidence
 * instead of decoration.
 *
 * Built on <dialog>, which brings focus trapping, Esc, and the backdrop with
 * no extra code, matching the GitHub access modal already in the product.
 */
export function ErrorDialog({
  open,
  title,
  summary,
  detail,
  onClose,
  onRetry,
  isRetrying = false,
}: {
  open: boolean
  title: string
  /** One plain sentence about what happened, in the product's voice. */
  summary: string
  /** The provider's own words. Shown exactly as received. */
  detail: string | null
  onClose: () => void
  onRetry?: () => void
  isRetrying?: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="deployment-error-title"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink-default shadow-float backdrop:bg-ink/25"
    >
      <div className="flex items-start gap-3 border-b border-line px-6 py-5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#fdf4f2] text-[#a8341f]">
          <AlertTriangle className="size-4" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <h2
            id="deployment-error-title"
            className="font-heading text-lg font-medium tracking-[-0.02em] text-ink"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{summary}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-1 -mr-2 shrink-0 rounded-[4px] p-1.5 text-ink-muted transition-colors duration-150 ease-out hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {detail ? (
        <div className="px-6 py-5">
          <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            Reported by the provider
          </p>
          <p className="mt-2 border-l-2 border-[#a8341f] bg-canvas py-2.5 pr-3 pl-3.5 font-mono text-sm leading-relaxed break-words text-ink-strong">
            {detail}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3 border-t border-line px-6 py-4">
        <button type="button" onClick={onClose} className={secondaryButton}>
          Close
        </button>
        {onRetry ? (
          <button
            type="button"
            disabled={isRetrying}
            onClick={onRetry}
            className={primaryButton}
          >
            <RotateCw
              className={`mr-2 size-4 ${isRetrying ? "motion-safe:animate-spin" : ""}`}
              aria-hidden
            />
            {isRetrying ? "Retrying…" : "Retry Deployment"}
          </button>
        ) : null}
      </div>
    </dialog>
  )
}
