"use client"

import { AlertTriangle, Loader2, Square, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

import { apiFetch } from "@/lib/api"
import { card, inputClass, secondaryButton } from "@/lib/ui"
import type { ActionAvailability } from "@tisiops/server/services/deployments/lifecycle"

/**
 * Stop, start, and delete for any deployment.
 *
 * The server decides which actions apply — a Vercel deployment has no machine
 * to power off, and a button that cannot work is worse than no button. This
 * only renders what it is told is available.
 *
 * Destructive actions sit behind a typed DELETE, checked here, again by the
 * API, and again by the worker.
 */

type Action = "stop" | "start" | "delete" | "remove"

const dangerButton = `${secondaryButton} border-[#f0d3cc] text-[#a8341f] hover:bg-[#fdf4f2]`

export function DeploymentActions({ id }: { id: string }) {
  const [actions, setActions] = useState<ActionAvailability | null>(null)
  const [confirm, setConfirm] = useState("")
  const [pending, setPending] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    apiFetch<ActionAvailability>(`/api/deployments/${id}/actions`)
      .then((next) => active && setActions(next))
      .catch(() => active && setActions(null))

    return () => {
      active = false
    }
  }, [id])

  if (!actions) return null

  // A panel that renders only to say it has nothing to offer is noise. The
  // absent buttons already say it.
  const nothingToDo =
    !actions.canStop && !actions.canDelete && !actions.canRemove

  if (nothingToDo) return null

  async function run(action: Action) {
    setPending(action)
    setError(null)

    try {
      await apiFetch(`/api/deployments/${id}/actions/${action}`, {
        method: "POST",
        body: JSON.stringify({ confirm }),
      })

      // `remove` deletes the record, so there is no page left to return to.
      window.location.href =
        action === "remove" ? "/dashboard/deployments" : window.location.href
      if (action !== "remove") window.location.reload()
    } catch (cause) {
      setError((cause as Error).message)
      setPending(null)
    }
  }

  const busy = (action: Action) =>
    pending === action ? (
      <Loader2 className="mr-2 size-4 motion-safe:animate-spin" aria-hidden />
    ) : null

  return (
    <div className={`${card} mt-4`}>
      <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
        Manage
      </p>

      <div className="mt-3 flex flex-wrap gap-3">
        {actions.canStop ? (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => void run("stop")}
            className={secondaryButton}
          >
            {busy("stop") ?? <Square className="mr-2 size-4" aria-hidden />}
            Stop server
          </button>
        ) : null}

        {/* Start is promoted to the headline for a stopped deployment, where
            it is the only thing anyone wants to do. */}
      </div>

      {actions.canStop ? (
        <p className="mt-2.5 text-sm text-ink-muted">
          Stopping keeps the disk, the data, and the address. Compute charges
          stop; the Elastic IP is still billed.
        </p>
      ) : null}

      {actions.canDelete || actions.canRemove ? (
        <details className="mt-4 border-t border-line pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-strong">
            {actions.canDelete ? "Delete deployment" : "Remove from TisiOps"}
          </summary>

          <p className="mt-3 flex gap-2 text-sm text-ink-default">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-[#a8341f]"
              aria-hidden
            />
            <span>
              {actions.canDelete
                ? "This permanently removes the infrastructure and everything stored on it. It cannot be undone."
                : "This removes the TisiOps record. Nothing is left running."}
            </span>
          </p>

          <label className="mt-3 block text-sm font-medium text-ink-strong">
            Type DELETE to confirm
            <input
              className={inputClass}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-3">
            {actions.canDelete ? (
              <button
                type="button"
                disabled={confirm !== "DELETE" || pending !== null}
                onClick={() => void run("delete")}
                className={dangerButton}
              >
                {busy("delete") ?? (
                  <Trash2 className="mr-2 size-4" aria-hidden />
                )}
                Delete infrastructure
              </button>
            ) : null}

            {actions.canRemove ? (
              <button
                type="button"
                disabled={confirm !== "DELETE" || pending !== null}
                onClick={() => void run("remove")}
                className={dangerButton}
              >
                {busy("remove") ?? (
                  <Trash2 className="mr-2 size-4" aria-hidden />
                )}
                Remove from TisiOps
              </button>
            ) : null}
          </div>
        </details>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-[#a8341f]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
