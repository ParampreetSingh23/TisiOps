"use client"

import { Check, Copy, Sparkles, X } from "lucide-react"
import { useState } from "react"

import { ModelLogo } from "./model-logo"

export interface Model {
  id: string
  modelCode: string
  displayName: string
  providerId: string
  providerModel: string
  description: string | null
  contextWindow: number | null
  inputPricePer1M: string | number | null
  outputPricePer1M: string | number | null
  currency?: string
  isEnabled: boolean
  isDefault?: boolean
  tags: string[] | null
  provider: { name: string; providerId: string; type?: string }
}

interface ModelDetailsDrawerProps {
  model: Model | null
  onClose: () => void
}

export function ModelDetailsDrawer({ model, onClose }: ModelDetailsDrawerProps) {
  const [copiedId, setCopiedId] = useState(false)

  if (!model) return null

  function handleCopyId() {
    if (!model) return
    navigator.clipboard.writeText(model.modelCode)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  const sampleCurl = `curl https://api.tisiops.com/api/v1/ai/chat \\
  -H "Authorization: Bearer $TISIOPS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.modelCode}",
    "messages": [
      { "role": "user", "content": "Analyze my deployment error logs." }
    ]
  }'`

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-lg flex-col justify-between border-l border-line bg-surface p-6 shadow-2xl overflow-y-auto">
        <div>
          {/* Header */}
          <div className="flex items-start justify-between border-b border-line pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-[6px] border border-line bg-canvas p-1.5 shadow-xs">
                <ModelLogo
                  providerId={model.providerId}
                  modelCode={model.modelCode}
                  name={model.displayName}
                  className="size-6"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-brand uppercase">
                    {model.provider.name}
                  </span>
                  {model.isDefault && (
                    <span className="rounded-[3px] bg-brand-soft border border-brand/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand">
                      DEFAULT
                    </span>
                  )}
                </div>
                <h2 className="mt-0.5 font-heading text-xl font-semibold text-ink-strong">
                  {model.displayName}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-[4px] p-1 text-ink-muted hover:bg-canvas hover:text-ink-strong transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Model Identification Box */}
          <div className="mt-5 rounded-[6px] border border-line bg-canvas p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold uppercase text-ink-muted block">
                Model Identifier
              </span>
              <code className="font-mono text-xs font-semibold text-brand">
                {model.modelCode}
              </code>
            </div>
            <button
              onClick={handleCopyId}
              className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-line bg-surface px-2.5 text-xs text-ink-default hover:border-line-warm transition-colors"
            >
              {copiedId ? (
                <>
                  <Check className="size-3 text-emerald-600" />
                  <span className="text-[11px]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3 text-ink-muted" />
                  <span className="text-[11px]">Copy ID</span>
                </>
              )}
            </button>
          </div>

          {/* Description */}
          <div className="mt-5 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Description & Capabilities
            </h3>
            <p className="text-xs leading-relaxed text-ink-default">
              {model.description || "Production AI model routed through TisiOps AI Gateway with rate limiting and audit logging."}
            </p>
          </div>

          {/* Specifications Table */}
          <div className="mt-6 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Technical Specifications
            </h3>
            <div className="divide-y divide-line border-y border-line text-xs">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">Upstream Provider Model</span>
                <span className="font-mono font-medium text-ink-strong">{model.providerModel}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">Context Window</span>
                <span className="font-mono font-medium text-ink-strong">
                  {model.contextWindow ? `${model.contextWindow.toLocaleString()} tokens` : "1,000,000 tokens"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">Input Pricing / 1M tokens</span>
                <span className="font-mono font-medium text-ink-strong">
                  {model.inputPricePer1M ? `$${model.inputPricePer1M}` : "Included in plan"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">Output Pricing / 1M tokens</span>
                <span className="font-mono font-medium text-ink-strong">
                  {model.outputPricePer1M ? `$${model.outputPricePer1M}` : "Included in plan"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-ink-muted">Gateway Status</span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Available
                </span>
              </div>
            </div>
          </div>

          {/* Sample Usage Request */}
          <div className="mt-6 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Example Gateway Call
            </h3>
            <pre className="scrollbar-subtle overflow-auto rounded-[6px] border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-default select-all">
              <code>{sampleCurl}</code>
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t border-line pt-4 flex justify-end">
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-[6px] border border-line bg-canvas px-4 text-xs font-medium text-ink-default hover:bg-surface transition-colors"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  )
}
