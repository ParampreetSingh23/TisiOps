"use client"

import { AlertTriangle, Loader2, X } from "lucide-react"
import { useEffect, useRef } from "react"

import { secondaryButton } from "@/lib/ui"

export function ConfirmModal({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  isSubmitting = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: "danger" | "warning" | "default"
  isSubmitting?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  if (!open) return null

  const confirmButtonClass =
    variant === "danger"
      ? "inline-flex h-10 items-center justify-center rounded-[6px] bg-red-600 px-4 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-red-700 active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
      : "inline-flex h-10 items-center justify-center rounded-[6px] bg-brand px-4 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-hover active:bg-brand-active disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink-default shadow-card backdrop:bg-black/60 backdrop:backdrop-blur-xs"
    >
      <div className="flex items-start justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          {variant === "danger" && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <AlertTriangle className="size-4" aria-hidden />
            </span>
          )}
          <h2 className="font-heading text-base font-semibold tracking-[-0.02em] text-ink-strong">
            {title}
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="rounded-[4px] p-1 text-ink-muted transition-colors hover:bg-canvas hover:text-ink-strong"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="px-5 py-4 text-sm text-ink-muted">
        <p className="leading-relaxed">{description}</p>
      </div>

      <div className="flex justify-end gap-2.5 border-t border-line px-5 py-3.5">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className={secondaryButton}
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting}
          className={confirmButtonClass}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Processing...
            </>
          ) : (
            confirmText
          )}
        </button>
      </div>
    </dialog>
  )
}
