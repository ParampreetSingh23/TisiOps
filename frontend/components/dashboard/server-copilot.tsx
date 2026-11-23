"use client"

import { ArrowLeft, ArrowUp, Bot, ChevronDown, ChevronUp, History, Loader2, SquarePen } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { apiFetch } from "@/lib/api"

type Chat = { id: string; title: string; updatedAt: string }
type Message = { id: string; role: "user" | "assistant"; content: string }
type Plan = { id: string; diagnosis: string; actions: { label: string }[] }

const suggestions = ["Check server health", "Check Docker containers", "Show recent errors", "Check disk usage"]

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })

function AgentAvatar({ size = "size-8" }: { size?: string }) {
  return <span className={`flex ${size} shrink-0 items-center justify-center rounded-[6px] bg-brand text-white`}>
    <Bot className="size-[55%]" />
  </span>
}

export function ServerCopilot({ serverId }: { serverId: string; dockerInstalled: boolean }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<"chat" | "history">("chat")
  const [loaded, setLoaded] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Chat[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [message, setMessage] = useState("")
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }) }, [messages, plan, open, view, loading])

  async function loadSession(id: string) {
    const chat = await apiFetch<{ id: string; messages: Message[] }>(`/api/servers/${serverId}/copilot/sessions/${id}`)
    setSessionId(chat.id)
    setMessages(chat.messages)
    setPlan(null)
    setView("chat")
  }

  async function newChat() {
    setError(null)
    try {
      const chat = await apiFetch<Chat>(`/api/servers/${serverId}/copilot/sessions`, { method: "POST", body: JSON.stringify({ title: "Server chat" }) })
      setSessions((current) => [chat, ...current])
      setSessionId(chat.id)
      setMessages([])
      setPlan(null)
      setView("chat")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start a new chat.") }
  }

  // Chats load on first expand only; collapsing keeps the conversation in place.
  async function toggle() {
    const next = !open
    setOpen(next)
    if (!next || loaded) return
    setLoaded(true)
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
    setMessage("")
    // Show the question right away; the server response replaces the list.
    setMessages((current) => [...current, { id: `pending-${Date.now()}`, role: "user", content: text }])
    try {
      const result = await apiFetch<{ type: "inspection" | "plan" | "unsupported"; id?: string; diagnosis?: string; actions?: { label: string }[]; messages: Message[] }>(`/api/servers/${serverId}/copilot/ask`, { method: "POST", body: JSON.stringify({ message: text, sessionId }) })
      setMessages(result.messages)
      if (result.type === "plan" && result.id && result.diagnosis && result.actions) setPlan({ id: result.id, diagnosis: result.diagnosis, actions: result.actions })
      setSessions((current) => current.map((chat) => chat.id === sessionId ? { ...chat, updatedAt: new Date().toISOString() } : chat))
    } catch (cause) {
      setMessages((current) => current.filter((item) => !item.id.startsWith("pending-")))
      setMessage(text)
      setError(cause instanceof Error ? cause.message : "The agent could not process this request.")
    }
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

  const iconButton = "flex size-8 items-center justify-center rounded-[4px] text-ink-muted transition-colors hover:bg-canvas hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"

  return <aside aria-label="TisiOps Server Agent" className="fixed bottom-0 right-4 z-50 flex w-[min(380px,calc(100vw-32px))] flex-col rounded-t-[6px] border border-b-0 border-line bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.10),0_2px_8px_rgba(0,0,0,0.04)] sm:right-6">
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line pl-3 pr-2">
      {open && view === "history"
        ? <button type="button" onClick={() => setView("chat")} aria-label="Back to chat" className={iconButton}><ArrowLeft className="size-4" /></button>
        : <AgentAvatar />}
      <button type="button" onClick={() => void toggle()} aria-expanded={open} className="min-w-0 flex-1 text-left focus-visible:outline-none">
        <span className="block truncate text-sm font-semibold text-ink-strong">{open && view === "history" ? "Past chats" : "TisiOps Agent"}</span>
        <span className="block truncate text-xs text-ink-muted">{open ? "Scoped to this server" : "Ask about this server"}</span>
      </button>
      {open && view === "chat" && <>
        <button type="button" onClick={() => setView("history")} aria-label="Past chats" className={iconButton}><History className="size-4" /></button>
        <button type="button" onClick={() => void newChat()} aria-label="New chat" className={iconButton}><SquarePen className="size-4" /></button>
      </>}
      <button type="button" onClick={() => void toggle()} aria-label={open ? "Minimize agent" : "Open agent"} className={`${iconButton} rounded-full bg-canvas`}>{open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}</button>
    </header>

    {open && view === "history" && <ul className="h-[min(560px,calc(100vh-140px))] overflow-y-auto">
      {sessions.map((chat) => <li key={chat.id}>
        <button type="button" onClick={() => void loadSession(chat.id)} className={`flex w-full items-center gap-3 border-b border-line px-3 py-3 text-left transition-colors hover:bg-canvas ${chat.id === sessionId ? "bg-brand-soft" : ""}`}>
          <AgentAvatar size="size-10" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-medium text-ink-strong">{chat.title}</span><span className="shrink-0 text-xs text-ink-muted">{shortDate(chat.updatedAt)}</span></span>
            <span className="block truncate text-xs text-ink-muted">{chat.id === sessionId ? "Current chat" : "Tap to continue"}</span>
          </span>
        </button>
      </li>)}
      {sessions.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-muted">No chats yet. Start one with the pen icon.</li>}
    </ul>}

    {open && view === "chat" && <div className="flex h-[min(560px,calc(100vh-140px))] flex-col">
      <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.length === 0 && !loading && <div className="flex flex-col items-center px-4 pt-6 text-center">
          <AgentAvatar size="size-12" />
          <p className="mt-3 text-sm font-semibold text-ink-strong">How can I help with this server?</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">Checks run right away. Changes come back as a plan you approve first.</p>
        </div>}
        {messages.map((item) => item.role === "user"
          ? <div key={item.id} className="flex justify-end"><p className="max-w-[80%] whitespace-pre-wrap rounded-[6px] rounded-br-[2px] bg-brand px-3 py-2 text-sm leading-5 text-white">{item.content}</p></div>
          : <div key={item.id} className="flex items-end gap-2"><AgentAvatar size="size-6" /><p className="max-w-[80%] whitespace-pre-wrap rounded-[6px] rounded-bl-[2px] border border-line bg-canvas px-3 py-2 text-sm leading-5 text-ink-default">{item.content}</p></div>)}
        {loading && <div className="flex items-end gap-2" aria-live="polite"><AgentAvatar size="size-6" /><p className="flex gap-1 rounded-[6px] rounded-bl-[2px] border border-line bg-canvas px-3 py-3" aria-label="Agent is typing">{[0, 150, 300].map((delay) => <span key={delay} style={{ animationDelay: `${delay}ms` }} className="size-1.5 rounded-full bg-ink-muted motion-safe:animate-bounce" />)}</p></div>}
        {plan && <section className="ml-8 border border-brand/30 bg-brand-soft p-3">
          <p className="text-sm font-semibold text-ink-strong">Plan to review</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">{plan.diagnosis}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-default">{plan.actions.map((action) => <li key={action.label}>{action.label}</li>)}</ul>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={approving} onClick={() => void approvePlan()} className="rounded-[4px] bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50">{approving ? "Approving…" : "Approve & run"}</button>
            <button type="button" disabled={approving} onClick={() => setPlan(null)} className="rounded-[4px] border border-line-warm bg-surface px-3 py-1.5 text-xs font-medium text-ink-default">Dismiss</button>
          </div>
        </section>}
        <div ref={endRef} />
      </main>
      {error && <p role="alert" className="mx-3 mb-2 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <footer className="shrink-0 border-t border-line px-3 pb-3 pt-2">
        <div className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none]">{suggestions.map((suggestion) => <button key={suggestion} type="button" disabled={loading || !sessionId} onClick={() => void ask(suggestion)} className="shrink-0 rounded-full border border-line-warm px-3 py-1 text-xs text-ink-default transition-colors hover:border-brand hover:text-brand disabled:opacity-50">{suggestion}</button>)}</div>
        <form onSubmit={(event) => { event.preventDefault(); void ask() }} className="flex items-end gap-2 rounded-[6px] border border-line-warm bg-canvas p-1.5 focus-within:border-brand">
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask() } }} maxLength={500} rows={1} placeholder="Write a message…" aria-label="Message the agent" className="max-h-28 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink-strong outline-none [field-sizing:content] placeholder:text-ink-muted" />
          <button type="submit" disabled={!message.trim() || loading || !sessionId} aria-label="Send message" className="flex size-8 shrink-0 items-center justify-center rounded-[4px] bg-brand text-white transition-colors hover:bg-brand-hover disabled:bg-[#FFD9CA]">{loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}</button>
        </form>
      </footer>
    </div>}
  </aside>
}
