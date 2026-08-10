"use client"

import { ArrowUp, MessageSquare, Plus, Trash2, Waypoints } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { GithubCards } from "@/components/dashboard/github-cards"
import { Markdown } from "@/components/dashboard/markdown"
import { N8nFlow } from "@/components/deployment/n8n-flow"
import { VercelFlow } from "@/components/deployment/vercel-flow"
import { UsageMeter } from "@/components/dashboard/ai-usage-meter"
import { apiFetch } from "@/lib/api"
import type { UsageSummary } from "@tisiops/server/services/ai/usage"
import type { GithubAgentResponse } from "@tisiops/server/services/github/agent"

/** The console always gets structured data back, not just text. */
type ChatResponse =
  | { type: "answer"; intent: string; message: string }
  | {
      type: "vercel_deployment_flow"
      intent: string
      message: string
      nextStep: string
    }
  | {
      type: "n8n_deployment_flow"
      intent: string
      message: string
      nextStep: string
    }
  | GithubAgentResponse

/**
 * `opensVercelFlow` marks the assistant turn that starts a deployment. The
 * flow component fetches its own state, so nothing about the deployment is
 * carried in the message.
 */
type Message = {
  role: "user" | "assistant"
  content: string
  opensVercelFlow?: boolean
  /** Marks the turn that proposes a managed n8n server, same as above. */
  opensN8nFlow?: boolean
  /** github_agent findings for this turn. Live only — never persisted. */
  github?: GithubAgentResponse
  /** The question that produced `github`, so a card can ask a follow-up. */
  question?: string
}

type SessionSummary = { id: string; title: string; updatedAt: string }
type SessionDetail = SessionSummary & { messages: Message[] }

/**
 * Chats live in the database, scoped to the signed-in user — nothing about a
 * conversation is kept in browser storage, so a second account signing in on
 * this machine starts from its own empty list.
 *
 * This key is the old client-side store. Clearing it on mount wipes history
 * left behind on shared browsers by the previous version.
 */
const LEGACY_STORAGE_KEY = "tisiops.conversations"

const suggestions = [
  "Spin a new server using the n8n template",
  "I have a repo in GitHub. Deploy it on Vercel.",
  "Show me why production is failing",
  "Restart my production service",
  "Reduce my monthly cloud cost",
]

function titleFrom(text: string) {
  const clean = text.trim().replace(/\s+/g, " ")
  return clean.length > 38 ? `${clean.slice(0, 38)}…` : clean
}

export function AiConsole({ firstName }: { firstName: string | null }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Load this user's sessions, and clear anything the old browser-storage
  // version left behind for whoever used this machine before.
  useEffect(() => {
    let active = true

    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // Storage blocked — nothing to clean up.
    }

    apiFetch<SessionSummary[]>("/api/chat/sessions")
      .then((list) => {
        if (active) setSessions(list)
      })
      .catch(() => {
        if (active) setError("Could not load your chats")
      })

    return () => {
      active = false
    }
  }, [])

  const isEmpty = messages.length === 0

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, isSending])

  async function openSession(id: string) {
    setActiveId(id)
    setError(null)
    setIsLoadingChat(true)

    try {
      // The server answers 404 for a session that is not this user's, so a
      // pasted id from another account is indistinguishable from a dead one.
      const session = await apiFetch<SessionDetail>(`/api/chat/sessions/${id}`)
      setMessages(session.messages)
    } catch (caught) {
      setMessages([])
      setError(caught instanceof Error ? caught.message : "Chat not found")
    } finally {
      setIsLoadingChat(false)
    }
  }

  function startNewChat() {
    setActiveId(null)
    setMessages([])
    setPrompt("")
    setError(null)
  }

  async function remove(id: string) {
    const previous = sessions
    setSessions((list) => list.filter((item) => item.id !== id))
    if (id === activeId) startNewChat()

    try {
      await apiFetch(`/api/chat/sessions/${id}`, { method: "DELETE" })
    } catch (caught) {
      setSessions(previous)
      setError(caught instanceof Error ? caught.message : "Could not delete")
    }
  }

  /** Read after every turn so the meter reflects what was just spent. */
  const refreshUsage = () =>
    apiFetch<UsageSummary>("/api/ai/usage")
      .then(setUsage)
      // A failed read must not break the console; the server enforces anyway.
      .catch(() => {})

  useEffect(() => {
    void refreshUsage()
  }, [])

  async function send(text: string) {
    const content = text.trim()
    if (!content || isSending) return

    setMessages((current) => [...current, { role: "user", content }])
    setPrompt("")
    setError(null)
    setIsSending(true)

    try {
      // A chat with no session yet gets one now; the server assigns it to the
      // Clerk user, which is why no id is sent from here.
      let sessionId = activeId
      if (!sessionId) {
        const created = await apiFetch<SessionSummary>("/api/chat/sessions", {
          method: "POST",
          body: JSON.stringify({ title: titleFrom(content) }),
        })
        sessionId = created.id
        setActiveId(created.id)
        setSessions((list) => [created, ...list])
      }

      // Only the new message goes up — the server reads the history it stored.
      const response = await apiFetch<ChatResponse>(
        `/api/chat/sessions/${sessionId}/messages`,
        { method: "POST", body: JSON.stringify({ content }) }
      )

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response.message,
          ...(response.type === "vercel_deployment_flow"
            ? { opensVercelFlow: true }
            : {}),
          ...(response.type === "n8n_deployment_flow"
            ? { opensN8nFlow: true }
            : {}),
          ...(response.type.startsWith("github_") || response.type === "error"
            ? { github: response as GithubAgentResponse, question: content }
            : {}),
        },
      ])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed")
    } finally {
      setIsSending(false)
      void refreshUsage()
    }
  }

  return (
    <div className="flex h-[calc(100svh-8rem)] flex-col gap-6 lg:h-[calc(100svh-6rem)] lg:flex-row lg:gap-8">
      {/* Conversation rail */}
      <aside className="flex shrink-0 flex-col gap-4 lg:w-60 lg:border-r lg:border-line lg:pr-6">
        <h1 className="font-heading text-lg font-semibold tracking-[-0.02em] text-ink-strong">
          TisiOps Agent
        </h1>

        <button
          type="button"
          onClick={startNewChat}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-[6px] border border-line-warm bg-surface px-4 text-sm font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted"
        >
          <Plus className="mr-2 size-4" aria-hidden />
          New chat
        </button>

        {sessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            No conversations yet
          </p>
        ) : (
          <ul className="-mr-2 flex scrollbar-subtle min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className={`group flex items-center gap-1 rounded-[6px] pr-1 transition-colors duration-150 ease-out ${
                  session.id === activeId ? "bg-brand-soft" : "hover:bg-surface"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void openSession(session.id)}
                  aria-current={session.id === activeId ? "true" : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-sm ${
                    session.id === activeId
                      ? "font-medium text-brand"
                      : "text-ink-default"
                  }`}
                >
                  <MessageSquare className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{session.title}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void remove(session.id)}
                  aria-label={`Delete chat: ${session.title}`}
                  className="shrink-0 rounded-[4px] p-1.5 text-ink-muted opacity-0 transition-colors duration-150 ease-out group-hover:opacity-100 hover:text-brand focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Thread + composer: thread takes the free height, composer sits at the bottom */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
          <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto pr-1">
            {isLoadingChat ? (
              <p className="py-8 text-sm text-ink-muted">Loading chat…</p>
            ) : isEmpty ? (
              <div className="flex h-full flex-col justify-center py-8">
                <Waypoints className="size-7 text-brand" aria-hidden />
                <h2 className="mt-5 font-heading text-xl font-medium tracking-[-0.02em] text-ink">
                  {firstName ? `Hi ${firstName}.` : "Hi there."}
                  <br />
                  What would you like to do?
                </h2>

                <div className="mt-6 flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send(suggestion)}
                      className="h-9 rounded-[6px] border border-line-warm bg-surface px-3.5 text-sm text-ink-default transition-colors duration-150 ease-out hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 py-6">
                {messages.map((message, index) =>
                  message.role === "user" ? (
                    <p
                      key={index}
                      className="ml-auto max-w-[80%] rounded-[8px] border border-line bg-surface px-3.5 py-2.5 text-sm whitespace-pre-wrap text-ink-strong shadow-card"
                    >
                      {message.content}
                    </p>
                  ) : (
                    <div key={index} className="flex gap-3 pr-6">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-brand-soft text-brand">
                        <Waypoints className="size-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Markdown>{message.content}</Markdown>
                        {message.opensVercelFlow ? <VercelFlow /> : null}
                        {message.opensN8nFlow ? <N8nFlow /> : null}
                        {message.github ? (
                          <GithubCards
                            response={message.github}
                            question={message.question ?? ""}
                            onAsk={(text) => void send(text)}
                          />
                        ) : null}
                      </div>
                    </div>
                  )
                )}

                {isSending ? (
                  <div className="flex items-center gap-3 text-sm text-ink-muted">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-brand-soft text-brand">
                      <Waypoints
                        className="size-3.5 animate-pulse"
                        aria-hidden
                      />
                    </span>
                    Thinking…
                  </div>
                ) : null}

                <div ref={endRef} />
              </div>
            )}
          </div>

          {error ? (
            <p
              role="alert"
              className="mb-3 rounded-[6px] border border-line bg-surface px-4 py-3 text-sm text-ink-default"
            >
              {error}
            </p>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void send(prompt)
            }}
            className="shrink-0 rounded-[8px] border border-line bg-surface shadow-float"
          >
            <label htmlFor="tisiops-prompt" className="sr-only">
              Ask TisiOps Agent
            </label>
            <textarea
              id="tisiops-prompt"
              rows={2}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void send(prompt)
                }
              }}
              placeholder="Ask TisiOps Agent to deploy, restart, roll back, or explain a failure…"
              className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-ink-strong placeholder:text-ink-muted focus:outline-none"
            />

            <div className="flex items-center gap-3 border-t border-line px-3 py-2.5">
              <span className="text-sm text-ink-muted">TisiOps Planner</span>
              <UsageMeter usage={usage} />
              <button
                type="submit"
                disabled={
                  isSending ||
                  prompt.trim().length === 0 ||
                  usage?.canSend === false ||
                  (usage ? prompt.trim().length > usage.maxInputChars : false)
                }
                aria-label="Send"
                className="inline-flex size-9 items-center justify-center rounded-[6px] bg-brand text-white transition-colors duration-150 ease-out hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
            </div>
          </form>

          <p className="mt-2.5 shrink-0 pb-1 text-center text-xs text-ink-muted">
            TisiOps can make mistakes, and never deploys anything before you
            approve it. Check anything important.
          </p>
        </div>
      </div>
    </div>
  )
}
