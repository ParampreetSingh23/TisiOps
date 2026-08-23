"use client"

import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  status: string
  lastUsedAt: string | null
  createdAt: string
}

interface ApiKeysSectionProps {
  keys: ApiKey[]
  onOpenCreateKey: () => void
  onRevokeKey: (id: string) => Promise<void>
  isLoading: boolean
}

function formatDate(val: string | null): string {
  if (!val) return "Never used"
  const d = new Date(val)
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function ApiKeysSection({
  keys,
  onOpenCreateKey,
  onRevokeKey,
  isLoading,
}: ApiKeysSectionProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  function handleCopyPrefix(id: string, prefix: string) {
    navigator.clipboard.writeText(`${prefix}••••••••7K2P`)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleRevoke(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to revoke API key "${name}"? Any active integrations using this key will immediately fail.`)) {
      return
    }
    setRevokingId(id)
    try {
      await onRevokeKey(id)
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
            API Keys
          </h2>
          <p className="text-xs text-ink-muted">
            Manage authentication keys used to access models through the gateway.
          </p>
        </div>

        <button
          onClick={onOpenCreateKey}
          className="inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-brand px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-hover active:bg-brand-active shadow-xs"
        >
          <Plus className="size-3.5" />
          <span>Create API Key</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-line bg-surface shadow-card">
        {keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border border-line bg-canvas">
              <KeyRound className="size-6 text-ink-muted" />
            </div>
            <h3 className="mt-4 font-heading text-base font-semibold text-ink-strong">
              No API keys generated
            </h3>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-muted">
              Generate a TisiOps API key to authenticate your scripts, backends, or agent workflows with the gateway.
            </p>
            <button
              onClick={onOpenCreateKey}
              className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-hover transition-colors"
            >
              <Plus className="size-3.5" />
              <span>Create First API Key</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-canvas/40 text-ink-muted">
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px]">Name</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px]">Key Prefix</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px]">Created</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px]">Last Used</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px]">Status</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {keys.map((key) => {
                  const isCopied = copiedId === key.id
                  const isRevoking = revokingId === key.id

                  return (
                    <tr key={key.id} className="hover:bg-canvas/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <KeyRound className="size-3.5 text-brand shrink-0" />
                          <span className="font-medium text-ink-strong truncate max-w-[200px]">
                            {key.name}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="inline-flex items-center gap-1.5 rounded-[4px] border border-line bg-canvas px-2 py-1 font-mono text-[11px] text-ink-default">
                          <span>{key.keyPrefix}••••••••</span>
                          <button
                            onClick={() => handleCopyPrefix(key.id, key.keyPrefix)}
                            title="Copy key prefix identifier"
                            className="text-ink-muted hover:text-ink-strong transition-colors"
                          >
                            {isCopied ? (
                              <Check className="size-3 text-emerald-600" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="px-5 py-3.5 font-mono text-ink-muted text-[11px]">
                        {formatDate(key.createdAt)}
                      </td>

                      <td className="px-5 py-3.5 font-mono text-ink-muted text-[11px]">
                        {formatDate(key.lastUsedAt)}
                      </td>

                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-line px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                          <span className="size-1 rounded-full bg-emerald-500" />
                          {key.status}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => handleRevoke(key.id, key.name)}
                          disabled={isRevoking}
                          title="Revoke key immediately"
                          className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-brand transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                          <span className="hidden sm:inline">Revoke</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-line bg-canvas/30 px-5 py-3 text-[11px] font-mono text-ink-muted flex items-center justify-between">
          <span>{keys.length} total API keys registered</span>
          <span>Never commit API keys to public repositories</span>
        </div>
      </div>
    </section>
  )
}
