"use client"

import { useEffect, useState } from "react"

import { apiFetch } from "@/lib/api"
import { AiGatewayHeader } from "./ai-gateway-header"
import { ApiKeysSection } from "./api-keys-section"
import { CreateKeyModal } from "./create-key-modal"
import { GatewayEndpoint } from "./gateway-endpoint"
import { GatewayUsage } from "./gateway-usage"
import { GettingStarted } from "./getting-started"
import { ModelCatalog } from "./model-catalog"
import { ModelDetailsDrawer, type Model } from "./model-details-drawer"
import { QuickStart } from "./quick-start"

type Summary = {
  plan: string
  dailyMessagesUsed: number
  dailyMessagesLimit: number
  dailyTokensUsed: number
  dailyTokensLimit: number
  estimatedCostToday: string
  activeApiKeys: number
  availableModels: number
}

type ApiKey = {
  id: string
  name: string
  keyPrefix: string
  status: string
  lastUsedAt: string | null
  createdAt: string
}

type Usage = {
  totals: Summary
  rows: {
    modelCode: string
    source: string
    _count: { id: number }
    _sum: { totalTokens: number | null; estimatedCost: string | null }
  }[]
}

export function AiGatewayPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [usage, setUsage] = useState<Usage | null>(null)

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [summaryData, keyData, modelData, usageData] = await Promise.all([
        apiFetch<Summary>("/api/ai-gateway/summary").catch(() => null),
        apiFetch<ApiKey[]>("/api/ai-gateway/api-keys").catch(() => []),
        apiFetch<Model[]>("/api/ai-gateway/models").catch(() => []),
        apiFetch<Usage>("/api/ai-gateway/usage").catch(() => null),
      ])

      setSummary(summaryData)
      setKeys(keyData || [])
      setModels(modelData || [])
      setUsage(usageData)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load AI Gateway telemetry.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  async function handleCreateKey(name: string): Promise<string | null> {
    const created = await apiFetch<ApiKey & { key: string }>("/api/ai-gateway/api-keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    })
    setCreatedKey(created.key)
    await loadData()
    return created.key
  }

  async function handleRevokeKey(id: string) {
    await apiFetch(`/api/ai-gateway/api-keys/${id}`, { method: "DELETE" })
    await loadData()
  }

  const firstKeyPrefix = keys[0]?.keyPrefix

  return (
    <div className="mx-auto max-w-[1400px] space-y-10 pb-16">
      {/* Global Error Banner if API Fails */}
      {error && (
        <div className="rounded-[6px] border border-brand/30 bg-brand-soft p-4 text-xs font-medium text-brand">
          {error}
        </div>
      )}

      {/* 1. AI Gateway Header / Hero */}
      <AiGatewayHeader
        onOpenCreateKey={() => setIsCreateModalOpen(true)}
        onRefresh={loadData}
        isLoading={loading}
      />

      {/* 2. Getting Started */}
      <GettingStarted
        onOpenCreateKey={() => setIsCreateModalOpen(true)}
        hasKeys={keys.length > 0}
        firstKeyPrefix={firstKeyPrefix}
      />

      {/* 3. Usage Overview */}
      <GatewayUsage
        summary={summary}
        rows={usage?.rows || []}
        isLoading={loading}
      />

      {/* 4. API Keys */}
      <ApiKeysSection
        keys={keys}
        onOpenCreateKey={() => setIsCreateModalOpen(true)}
        onRevokeKey={handleRevokeKey}
        isLoading={loading}
      />

      {/* 5. Models & Pricing */}
      <ModelCatalog
        models={models}
        onSelectModel={(model) => setSelectedModel(model)}
        isLoading={loading}
      />

      {/* 6. Gateway Endpoint */}
      <GatewayEndpoint />

      {/* 7. Quick Start & Integration */}
      <QuickStart />

      {/* Modals & Slide-over Drawers */}
      <CreateKeyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateKey={handleCreateKey}
        createdKey={createdKey}
        onClearCreatedKey={() => setCreatedKey(null)}
      />

      <ModelDetailsDrawer
        model={selectedModel}
        onClose={() => setSelectedModel(null)}
      />
    </div>
  )
}
