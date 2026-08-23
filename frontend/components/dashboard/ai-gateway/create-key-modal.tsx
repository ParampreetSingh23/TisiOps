"use client"

import { Check, Copy, KeyRound, X } from "lucide-react"
import { useState } from "react"

interface CreateKeyModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateKey: (name: string) => Promise<string | null>
  createdKey: string | null
  onClearCreatedKey: () => void
}

export function CreateKeyModal({
  isOpen,
  onClose,
  onCreateKey,
  createdKey,
  onClearCreatedKey,
}: CreateKeyModalProps) {
  const [keyName, setKeyName] = useState("Default Production Key")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen && !createdKey) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!keyName.trim()) return
    setIsSubmitting(true)
    setError(null)
    try {
      await onCreateKey(keyName.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key.")
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleCopy() {
    if (!createdKey) return
    navigator.clipboard.writeText(createdKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClose() {
    setKeyName("Default Production Key")
    setError(null)
    onClearCreatedKey()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-[8px] border border-line bg-surface p-6 shadow-float">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-[4px] border border-line bg-canvas">
              <KeyRound className="size-4 text-brand" />
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold text-ink-strong">
                {createdKey ? "API Key Generated" : "Create TisiOps API Key"}
              </h3>
              <p className="text-xs text-ink-muted">
                {createdKey
                  ? "Copy and save your secret key securely."
                  : "Authenticate external client requests to TisiOps AI Gateway."}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-[4px] p-1 text-ink-muted hover:bg-canvas hover:text-ink-strong transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        {createdKey ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-[6px] border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-800 dark:text-amber-300">
              <p className="font-semibold">Important Security Notice</p>
              <p className="mt-1 leading-relaxed text-ink-muted">
                This is the only time your full API key will be displayed. Copy and store it in a secure secrets manager. TisiOps does not store raw keys and cannot show it again.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-muted uppercase">
                Your Secret Key
              </label>
              <div className="mt-2 flex items-center gap-2 rounded-[6px] border border-line bg-canvas p-2.5">
                <code className="flex-1 font-mono text-xs text-brand break-all select-all font-medium">
                  {createdKey}
                </code>
                <button
                  onClick={handleCopy}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[4px] bg-brand px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-hover active:bg-brand-active"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleClose}
                className="inline-flex h-9 items-center justify-center rounded-[6px] bg-brand px-5 text-xs font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {error && (
              <div className="rounded-[4px] border border-brand/20 bg-brand-soft p-3 text-xs text-brand">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="keyName" className="block text-xs font-semibold text-ink-strong">
                Key Identifier Name
              </label>
              <p className="mt-0.5 text-xs text-ink-muted">
                A descriptive name to identify where this key is used (e.g. CLI, Staging Backend, Production Worker).
              </p>
              <input
                id="keyName"
                type="text"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g. Production Backend"
                className="mt-2.5 w-full rounded-[6px] border border-line bg-canvas px-3 py-2 text-sm text-ink-strong outline-none focus:border-brand transition-colors"
                autoFocus
                required
              />
            </div>

            <div className="border-t border-line pt-4 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-9 items-center justify-center rounded-[6px] border border-line bg-canvas px-4 text-xs font-medium text-ink-default hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !keyName.trim()}
                className="inline-flex h-9 items-center justify-center rounded-[6px] bg-brand px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {isSubmitting ? "Generating..." : "Generate Key"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
