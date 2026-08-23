"use client"

import { Check, Copy, ExternalLink, Search, Sparkles } from "lucide-react"
import { useMemo, useState } from "react"

import type { Model } from "./model-details-drawer"
import { ModelLogo } from "./model-logo"

interface ModelCatalogProps {
  models: Model[]
  onSelectModel: (model: Model) => void
  isLoading: boolean
}

export function ModelCatalog({
  models,
  onSelectModel,
  isLoading,
}: ModelCatalogProps) {
  const [selectedProvider, setSelectedProvider] = useState<string>("ALL")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // Dynamically extract unique providers from the models list
  const providers = useMemo(() => {
    const map = new Map<string, string>()
    models.forEach((m) => {
      if (m.provider?.providerId) {
        map.set(m.provider.providerId, m.provider.name)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [models])

  // Filter models by provider and search query
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchProvider =
        selectedProvider === "ALL" || m.providerId === selectedProvider
      const query = searchQuery.toLowerCase().trim()
      const matchQuery =
        !query ||
        m.displayName.toLowerCase().includes(query) ||
        m.modelCode.toLowerCase().includes(query) ||
        (m.description && m.description.toLowerCase().includes(query))
      return matchProvider && matchQuery
    })
  }, [models, selectedProvider, searchQuery])

  function handleCopyCode(code: string, e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
            Models & Pricing
          </h2>
          <p className="text-xs text-ink-muted">
            Access supported models across verified AI providers using one consistent TisiOps API contract.
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search model or ID..."
            className="h-8 w-full rounded-[6px] border border-line bg-surface pl-8 pr-3 text-xs text-ink-strong outline-none focus:border-brand transition-colors"
          />
        </div>
      </div>

      {/* Provider Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line pb-2">
        <button
          onClick={() => setSelectedProvider("ALL")}
          className={`rounded-[4px] px-3 py-1 text-xs font-semibold transition-colors ${
            selectedProvider === "ALL"
              ? "bg-brand text-white shadow-xs"
              : "text-ink-muted hover:text-ink-strong hover:bg-surface"
          }`}
        >
          All Providers ({models.length})
        </button>
        {providers.map((p) => {
          const count = models.filter((m) => m.providerId === p.id).length
          const isSelected = selectedProvider === p.id

          return (
            <button
              key={p.id}
              onClick={() => setSelectedProvider(p.id)}
              className={`inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                isSelected
                  ? "bg-brand text-white shadow-xs font-semibold"
                  : "text-ink-muted hover:text-ink-strong hover:bg-surface"
              }`}
            >
              <ModelLogo providerId={p.id} className="size-3.5" />
              <span>{p.name}</span>
              <span className="opacity-70 text-[10px]">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Dense Models Table */}
      <div className="overflow-hidden rounded-[8px] border border-line bg-surface shadow-card">
        {filteredModels.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-muted">
            {isLoading
              ? "Loading model catalog..."
              : "No models found matching your selected provider or search term."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-canvas/40 text-ink-muted">
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px]">Model</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px]">Provider</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px] text-right">Input / 1M</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px] text-right">Output / 1M</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px] text-right">Context</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px]">Model ID</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[10px] text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredModels.map((model) => {
                  const isCopied = copiedCode === model.modelCode

                  return (
                    <tr
                      key={model.id}
                      onClick={() => onSelectModel(model)}
                      className="cursor-pointer hover:bg-canvas/40 transition-colors group"
                    >
                      {/* Model Name with Official Logo */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-[5px] border border-line bg-canvas p-1 shadow-xs">
                            <ModelLogo
                              providerId={model.providerId}
                              modelCode={model.modelCode}
                              name={model.displayName}
                              className="size-4"
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-ink-strong group-hover:text-brand transition-colors">
                                {model.displayName}
                              </span>
                              {model.isDefault && (
                                <span className="rounded-[3px] bg-brand-soft border border-brand/20 px-1 py-0.2 font-mono text-[9px] font-bold text-brand">
                                  DEFAULT
                                </span>
                              )}
                            </div>
                            {model.description && (
                              <p className="mt-0.5 max-w-xs text-[11px] text-ink-muted truncate">
                                {model.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Provider */}
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-ink-default">
                          {model.provider.name}
                        </span>
                      </td>

                      {/* Input / 1M */}
                      <td className="px-5 py-3.5 text-right font-mono text-ink-strong">
                        {model.inputPricePer1M ? `$${model.inputPricePer1M}` : "—"}
                      </td>

                      {/* Output / 1M */}
                      <td className="px-5 py-3.5 text-right font-mono text-ink-strong">
                        {model.outputPricePer1M ? `$${model.outputPricePer1M}` : "—"}
                      </td>

                      {/* Context */}
                      <td className="px-5 py-3.5 text-right font-mono text-ink-muted text-[11px]">
                        {model.contextWindow
                          ? `${(model.contextWindow / 1000).toFixed(0)}k`
                          : "1M"}
                      </td>

                      {/* Model ID with 1-click copy */}
                      <td className="px-5 py-3.5">
                        <button
                          onClick={(e) => handleCopyCode(model.modelCode, e)}
                          title="Click to copy Model ID"
                          className="inline-flex items-center gap-1.5 rounded-[4px] border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] text-brand hover:border-brand transition-colors"
                        >
                          <span>{model.modelCode}</span>
                          {isCopied ? (
                            <Check className="size-3 text-emerald-600" />
                          ) : (
                            <Copy className="size-3 text-ink-muted group-hover:text-brand" />
                          )}
                        </button>
                      </td>

                      {/* Details Action */}
                      <td className="px-5 py-3.5 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted group-hover:text-brand transition-colors">
                          <span>Inspect</span>
                          <ExternalLink className="size-3" />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-line bg-canvas/30 px-5 py-3 text-[11px] font-mono text-ink-muted flex items-center justify-between">
          <span>Click any model to inspect specifications and parameters</span>
          <span>Configured via TisiOps Model Registry</span>
        </div>
      </div>
    </section>
  )
}
