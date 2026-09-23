"use client"

import { ArrowUp, Bot, Loader2, MessageSquarePlus, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { apiFetch } from "@/lib/api"

type Chat = { id: string; title: string; updatedAt: string }
type Message = { id: string; role: "user" | "assistant"; content: string }
type Plan = { id: string; diagnosis: string; actions: { label: string }[] }

const suggestions = ["Check server health", "Check Docker containers", "Show recent errors", "Check disk usage"]

export function ServerCopilot({ serverId }: { serverId: string; dockerInstalled: boolean }) {
  const [open, setOpen] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Chat[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [message, setMessage] = useState("")
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }) }, [messages, plan, open])

  async function loadSession(id: string) {
    const chat = await apiFetch<{ id: string; messages: Message[] }>(`/api/servers/${serverId}/copilot/sessions/${id}`)
    setSessionId(chat.id)
    setMessages(chat.messages)
  }

  async function newChat() {
    setError(null)
    const chat = await apiFetch<Chat>(`/api/servers/${serverId}/copilot/sessions`, { method: "POST", body: JSON.stringify({ title: "Server chat" }) })
    setSessions((current) => [chat, ...current])
    setSessionId(chat.id)
    setMessages([])
    setPlan(null)
  }

  async function openCopilot() {
    setOpen(true)
    setError(null)
    try {
      const chats = await apiFetch<Chat[]>(`/api/servers/${serverId}/copilot/sessions`)
      setSessions(chats)
      if (chats[0]) await loadSession(chats[0].id)
      else await newChat()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load server chats.") }
  }

  async function ask(value = message) {
    const text = value.trim()
    if (!text || !sessionId || loading) return
    setLoading(true)
    setError(null)
    setPlan(null)
    try {
      const result = await apiFetch<{ type: "inspection" | "plan" | "unsupported"; id?: string; diagnosis?: string; actions?: { label: string }[]; messages: Message[] }>(`/api/servers/${serverId}/copilot/ask`, { method: "POST", body: JSON.stringify({ message: text, sessionId }) })
      setMessages(result.messages)
      if (result.type === "plan" && result.id && result.diagnosis && result.actions) setPlan({ id: result.id, diagnosis: result.diagnosis, actions: result.actions })
      setMessage("")
      setSessions((current) => current.map((chat) => chat.id === sessionId ? { ...chat, updatedAt: new Date().toISOString() } : chat))
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Copilot could not process this request.") }
    finally { setLoading(false) }
  }

  async function approvePlan() {
    if (!plan) return
    setApproving(true)
    try {
      await apiFetch(`/api/servers/${serverId}/repairs/${plan.id}/approve`, { method: "POST" })
      setPlan(null)
      setMessages((current) => [...current, { id: `approved-${Date.now()}`, role: "assistant", content: "Approved and queued. Track the result in server monitoring." }])
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not approve this plan.") }
    finally { setApproving(false) }
  }

  return <>
    <button type="button" aria-label="Open TisiOps Server Agent" onClick={() => void openCopilot()} className="fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-[6px] bg-brand text-white shadow-[0_8px_30px_rgba(0,0,0,0.14)] transition-colors hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"><Bot className="size-5" /></button>
    {open && <aside aria-label="TisiOps Server Agent" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[580px] flex-col border-l border-line bg-surface shadow-[-8px_0_30px_rgba(0,0,0,0.10)]">
      <header className="flex h-20 shrink-0 items-center justify-between border-b border-line px-6">
        <div><h2 className="text-xl font-semibold tracking-tight text-ink-strong">TisiOps Agent</h2><p className="mt-0.5 text-xs text-ink-muted">Persistent chat · scoped to this server</p></div>
        <div className="flex items-center gap-1"><button type="button" onClick={() => void newChat()} className="flex min-h-10 items-center gap-2 rounded-[4px] px-3 text-sm font-medium text-ink-default hover:bg-canvas"><MessageSquarePlus className="size-4" />New chat</button><button type="button" onClick={() => setOpen(false)} aria-label="Close agent" className="rounded-[4px] p-2 text-ink-muted hover:bg-canvas hover:text-ink-strong"><X className="size-5" /></button></div>
      </header>
      <div className="border-b border-line px-6 py-2"><div className="flex gap-2 overflow-x-auto">{sessions.slice(0, 6).map((chat) => <button key={chat.id} type="button" onClick={() => void loadSession(chat.id)} className={`shrink-0 rounded-[4px] px-2.5 py-1.5 text-xs ${chat.id === sessionId ? "bg-brand-soft font-medium text-brand" : "text-ink-muted hover:bg-canvas"}`}>{chat.title}</button>)}</div></div>
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && <div className="mx-auto max-w-md border border-line p-5"><Bot className="size-5 text-brand" /><h3 className="mt-4 text-base font-semibold text-ink-strong">Your server operations workspace</h3><p className="mt-2 text-sm leading-6 text-ink-muted">Live checks run immediately. Any change receives a reviewed plan before it can execute.</p></div>}
        <div className="mx-auto max-w-2xl space-y-4">{messages.map((item) => <article key={item.id} className={item.role === "user" ? "ml-12 rounded-[6px] bg-canvas px-4 py-3 text-sm text-ink-strong" : "mr-4 border-l-2 border-brand px-4 py-1 text-sm leading-6 text-ink-default whitespace-pre-wrap"}>{item.content}</article>)}</div>
        {plan && <section className="mx-auto mt-5 max-w-2xl border border-brand/30 bg-brand-soft/50 p-4"><p className="text-sm font-semibold text-ink-strong">Reviewed execution plan</p><p className="mt-1 text-sm text-ink-muted">{plan.diagnosis}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-default">{plan.actions.map((action) => <li key={action.label}>{action.label}</li>)}</ul><div className="mt-4 flex gap-2"><button type="button" disabled={approving} onClick={() => void approvePlan()} className="rounded-[4px] bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{approving ? "Approving…" : "Approve & execute"}</button><button type="button" disabled={approving} onClick={() => setPlan(null)} className="rounded-[4px] border border-line-warm px-3 py-2 text-xs font-medium text-ink-default">Cancel</button></div></section>}
        <div ref={endRef} />
      </main>
      {error && <p role="alert" className="mx-6 mb-3 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <footer className="shrink-0 border-t border-line bg-surface px-6 py-4"><div className="mb-3 flex flex-wrap gap-2">{suggestions.map((suggestion) => <button key={suggestion} type="button" disabled={loading || !sessionId} onClick={() => void ask(suggestion)} className="rounded-[4px] border border-line-warm px-2.5 py-1.5 text-xs text-ink-default hover:bg-canvas disabled:opacity-50">{suggestion}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); void ask() }} className="flex items-end gap-2 rounded-[6px] border border-line-warm p-2 focus-within:border-brand"><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} rows={2} placeholder="Ask about this server…" className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink-strong outline-none placeholder:text-ink-muted" /><button type="submit" disabled={!message.trim() || loading || !sessionId} aria-label="Send request" className="flex size-10 shrink-0 items-center justify-center rounded-[4px] bg-brand text-white disabled:opacity-40">{loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}</button></form></footer>
    </aside>}
  </>
}
