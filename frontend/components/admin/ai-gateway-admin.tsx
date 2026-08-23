"use client"

import { useEffect, useState } from "react"
import { Plus, RefreshCw, Save } from "lucide-react"

import { apiFetch } from "@/lib/api"

type Provider = {
  id: string
  providerId: string
  name: string
  type: string
  baseUrl: string | null
  apiKeyEnvName: string | null
  isEnabled: boolean
  isSystem: boolean
}

type Model = {
  id: string
  modelCode: string
  displayName: string
  providerId: string
  providerModel: string
  description: string | null
  contextWindow: number | null
  isEnabled: boolean
  isPublic: boolean
  isDefault: boolean
}

type Usage = {
  totals: { _count: { id: number }; _sum: { totalTokens: number | null; estimatedCost: string | null } }
  byModel: { modelCode: string; _count: { id: number }; _sum: { totalTokens: number | null } }[]
  byProvider: { providerId: string; _count: { id: number }; _sum: { totalTokens: number | null } }[]
  errors: { errorCode: string | null; _count: { id: number } }[]
}

const emptyModel = {
  displayName: "",
  modelCode: "",
  providerId: "google-gemini",
  providerModel: "",
  description: "",
}

export function AiGatewayAdmin() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [usage, setUsage] = useState<Usage | null>(null)
  const [draft, setDraft] = useState(emptyModel)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const [providerData, modelData, usageData] = await Promise.all([
        apiFetch<Provider[]>("/api/admin/ai-gateway/providers"),
        apiFetch<Model[]>("/api/admin/ai-gateway/models"),
        apiFetch<Usage>("/api/admin/ai-gateway/usage"),
      ])
      setProviders(providerData)
      setModels(modelData)
      setUsage(usageData)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load AI Gateway admin.")
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [])

  async function toggleProvider(provider: Provider) {
    await apiFetch(`/api/admin/ai-gateway/providers/${provider.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isEnabled: !provider.isEnabled }),
    })
    await load()
  }

  async function toggleModel(model: Model) {
    await apiFetch(`/api/admin/ai-gateway/models/${model.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isEnabled: !model.isEnabled }),
    })
    await load()
  }

  async function addModel() {
    await apiFetch("/api/admin/ai-gateway/models", {
      method: "POST",
      body: JSON.stringify(draft),
    })
    setDraft(emptyModel)
    await load()
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-brand uppercase">Admin</p>
          <h1 className="mt-2 font-heading text-3xl font-medium tracking-[-0.04em] text-ink">AI Gateway</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Manage providers, models, usage, and limits. Provider API keys must be configured in server environment variables.
          </p>
        </div>
        <button onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-line-warm bg-surface px-3 text-sm font-medium text-ink-default hover:bg-canvas">
          <RefreshCw className="size-4" aria-hidden /> Refresh
        </button>
      </div>

      {error ? <p className="rounded-[6px] border border-line bg-surface p-3 text-sm text-brand">{error}</p> : null}

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[8px] border border-line bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-muted">Total requests</p>
          <p className="mt-2 font-heading text-2xl text-ink-strong">{usage?.totals._count.id ?? 0}</p>
        </div>
        <div className="rounded-[8px] border border-line bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-muted">Total tokens</p>
          <p className="mt-2 font-heading text-2xl text-ink-strong">{usage?.totals._sum.totalTokens ?? 0}</p>
        </div>
        <div className="rounded-[8px] border border-line bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-muted">Estimated cost</p>
          <p className="mt-2 font-heading text-2xl text-ink-strong">{usage?.totals._sum.estimatedCost ?? "0"}</p>
        </div>
      </section>

      <section className="rounded-[8px] border border-line bg-surface p-5 shadow-card">
        <h2 className="font-heading text-lg font-medium text-ink-strong">Providers</h2>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {providers.map((provider) => (
            <div key={provider.id} className="grid gap-3 py-4 text-sm lg:grid-cols-[1fr_1fr_1fr_auto]">
              <span className="font-semibold text-ink-strong">{provider.name}</span>
              <span className="font-mono text-brand">{provider.providerId}</span>
              <span className="text-ink-muted">{provider.apiKeyEnvName ?? "No env key"}</span>
              <button onClick={() => void toggleProvider(provider)} className="h-9 rounded-[6px] border border-line-warm px-3 text-ink-default hover:bg-canvas">
                {provider.isEnabled ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[8px] border border-line bg-surface p-5 shadow-card">
        <h2 className="font-heading text-lg font-medium text-ink-strong">Add model</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input placeholder="Display Name" value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} className="h-10 rounded-[6px] border border-line bg-canvas px-3 text-sm outline-none focus:border-brand" />
          <input placeholder="model-code" value={draft.modelCode} onChange={(event) => setDraft({ ...draft, modelCode: event.target.value })} className="h-10 rounded-[6px] border border-line bg-canvas px-3 text-sm outline-none focus:border-brand" />
          <select value={draft.providerId} onChange={(event) => setDraft({ ...draft, providerId: event.target.value })} className="h-10 rounded-[6px] border border-line bg-canvas px-3 text-sm outline-none focus:border-brand">
            {providers.map((provider) => <option key={provider.providerId} value={provider.providerId}>{provider.name}</option>)}
          </select>
          <input placeholder="provider-model" value={draft.providerModel} onChange={(event) => setDraft({ ...draft, providerModel: event.target.value })} className="h-10 rounded-[6px] border border-line bg-canvas px-3 text-sm outline-none focus:border-brand" />
          <button onClick={() => void addModel()} className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-hover">
            <Plus className="size-4" aria-hidden /> Add
          </button>
        </div>
      </section>

      <section className="rounded-[8px] border border-line bg-surface p-5 shadow-card">
        <h2 className="font-heading text-lg font-medium text-ink-strong">Models</h2>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {models.map((model) => (
            <div key={model.id} className="grid gap-3 py-4 text-sm lg:grid-cols-[1fr_1fr_1fr_auto]">
              <span className="font-semibold text-ink-strong">{model.displayName}</span>
              <span className="font-mono text-brand">{model.modelCode}</span>
              <span className="text-ink-muted">{model.providerId} · {model.providerModel}</span>
              <button onClick={() => void toggleModel(model)} className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-line-warm px-3 text-ink-default hover:bg-canvas">
                <Save className="size-4" aria-hidden /> {model.isEnabled ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
