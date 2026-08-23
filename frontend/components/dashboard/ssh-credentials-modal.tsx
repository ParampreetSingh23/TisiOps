"use client"

import { Key, Loader2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { apiFetch } from "@/lib/api"
import { inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui"

/**
 * Collects SSH credentials for an already-connected server. Only sent to the
 * backend; never stored in the browser beyond this form. The caller decides
 * what to do after a successful save (usually re-run monitoring).
 */
export function SshCredentialsModal({
  serverId,
  onClose,
  onSaved,
}: {
  serverId: string
  onClose: () => void
  onSaved: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [authType, setAuthType] = useState<"key" | "password">("key")
  const [privateKey, setPrivateKey] = useState("")
  const [password, setPassword] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
  }, [])

  const save = async () => {
    if (authType === "key" && !privateKey.trim()) {
      setError("Paste your SSH private key.")
      return
    }
    if (authType === "password" && !password) {
      setError("Enter your SSH password.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch(`/api/servers/${serverId}/credentials`, {
        method: "PUT",
        body: JSON.stringify({ authType, privateKey, password, passphrase }),
      })
      setSubmitting(false)
      onSaved()
      onClose()
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : "Could not save credentials.")
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink-default shadow-card backdrop:bg-black/60 backdrop:backdrop-blur-xs"
    >
      <div className="flex items-start justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Key className="size-4" aria-hidden />
          </span>
          <h2 className="font-heading text-base font-semibold tracking-[-0.02em] text-ink-strong">
            Add SSH Credentials
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-[4px] p-1 text-ink-muted transition-colors hover:bg-canvas hover:text-ink-strong"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <p className="text-xs text-ink-muted">
          Monitoring needs SSH access to this server. Add your credentials to
          retry the install.
        </p>

        <div className="flex gap-2">
          {(["key", "password"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setAuthType(type)}
              className={`flex-1 rounded-[6px] border px-3 py-2 text-sm font-medium transition-colors ${
                authType === type
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line-warm bg-surface text-ink-muted hover:bg-canvas"
              }`}
            >
              {type === "key" ? "SSH Key" : "Password"}
            </button>
          ))}
        </div>

        {authType === "key" ? (
          <div>
            <label className={labelClass}>Private Key</label>
            <textarea
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              rows={6}
              spellCheck={false}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              className={`${inputClass} h-auto min-h-32 font-mono text-xs`}
            />
          </div>
        ) : (
          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="SSH password"
            />
          </div>
        )}

        <div>
          <label className={labelClass}>Passphrase (optional)</label>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className={inputClass}
            placeholder="Key passphrase, if any"
          />
        </div>

        {error && (
          <p className="rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] px-3 py-2 text-xs text-[#a8341f] dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2.5 border-t border-line px-5 py-3.5">
        <button type="button" onClick={onClose} disabled={submitting} className={secondaryButton}>
          Cancel
        </button>
        <button type="button" onClick={() => void save()} disabled={submitting} className={primaryButton}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Credentials"
          )}
        </button>
      </div>
    </dialog>
  )
}
