"use client"

import { Check, Cloud, Server } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { apiFetch } from "@/lib/api"
import { card, primaryButton, secondaryButton } from "@/lib/ui"
import { ProviderIcon } from "@/components/deployment/provider-icon"

type Target = "BYOK" | "USER_AWS" | "TISIOPS_AWS"
type ServerOption = { id: string; name: string; provider: string; status: string; credentialsStored: boolean; dockerStatus: string | null; publicIp: string | null; host: string | null }
const routeFor: Record<string, string> = { "aws-n8n-server": "/dashboard/new-deployment/n8n", "postgres-managed-server": "/dashboard/new-deployment/postgres", ubuntu: "/dashboard/new-deployment/aws" }

export function DeploymentTargetPicker({ template }: { template: string }) {
  const router = useRouter()
  const [target, setTarget] = useState<Target>("TISIOPS_AWS")
  const [servers, setServers] = useState<ServerOption[]>([])
  const [serverId, setServerId] = useState("")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { apiFetch<ServerOption[]>("/api/servers").then(setServers).catch((cause: Error) => setError(cause.message)) }, [])
  const eligible = servers.filter((server) => server.status === "CONNECTED" && server.credentialsStored)
  const currentRoute = routeFor[template]
  function continueToTemplate() {
    if (target === "BYOK" && !serverId) { setError("Choose a connected server first."); return }
    if (!currentRoute) { router.push(`/dashboard/new-deployment/create?template=${encodeURIComponent(template)}&target=${target}${serverId ? `&serverId=${serverId}` : ""}`); return }
    if (target === "BYOK" && (template === "aws-n8n-server" || template === "postgres-managed-server")) { router.push(`${currentRoute}?targetServerId=${serverId}`); return }
    if (target !== "TISIOPS_AWS") { setError("This template does not have a selected-server executor yet."); return }
    router.push(currentRoute)
  }
  return <div className="mt-8 space-y-5"><div className="grid gap-3 md:grid-cols-3">{([
    ["BYOK", "Connected server", "Deploy to one of your SSH-connected servers."],
    ["USER_AWS", "Your AWS account", "Provision EC2 with your saved AWS connection."],
    ["TISIOPS_AWS", "TisiOps-managed AWS", "Use TisiOps-managed infrastructure."],
  ] as const).map(([id, title, description]) => <button key={id} type="button" onClick={() => setTarget(id)} className={`${card} min-h-40 text-left ${target === id ? "border-brand bg-brand-soft" : "hover:bg-canvas"}`}><span className="flex items-center gap-2 text-sm font-semibold text-ink-strong">{id === "BYOK" ? <Server className="size-4 text-brand" /> : <Cloud className="size-4 text-brand" />}{title}{target === id && <Check className="ml-auto size-4 text-brand" />}</span><span className="mt-3 block text-sm leading-6 text-ink-muted">{description}</span></button>)}</div>
    {target === "BYOK" && <section className={card}><h2 className="text-base font-semibold text-ink-strong">Select one connected server</h2><p className="mt-1 text-sm text-ink-muted">Only reachable servers with stored SSH credentials can receive a deployment.</p><div className="mt-4 grid gap-2">{eligible.map((server) => <label key={server.id} className={`flex cursor-pointer items-center gap-3 border p-3 ${serverId === server.id ? "border-brand bg-brand-soft" : "border-line"}`}><input type="radio" name="server" value={server.id} checked={serverId === server.id} onChange={() => setServerId(server.id)} /><ProviderIcon id={server.provider} className="text-ink-strong" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink-strong">{server.name}</span><span className="font-mono text-xs text-ink-muted">{server.publicIp || server.host || server.id.slice(0, 8)}</span></span><span className="text-xs text-ink-muted">{server.dockerStatus || "Docker unknown"}</span></label>)}{eligible.length === 0 && <p className="text-sm text-ink-muted">No eligible server. Connect and verify a server first.</p>}</div></section>}
    {target === "USER_AWS" && <section className={card}><p className="text-sm text-ink-muted">TisiOps will require a verified AWS connection before it can show an EC2 plan.</p></section>}
    {error && <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    <div className="flex gap-3"><button type="button" onClick={continueToTemplate} className={primaryButton}>Continue</button><button type="button" onClick={() => router.back()} className={secondaryButton}>Back</button></div></div>
}
