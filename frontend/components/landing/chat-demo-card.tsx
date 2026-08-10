"use client"

import { ArrowUp, Loader2, Terminal, User } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

/**
 * The hero card — a real conversation, not a picture of one.
 *
 * A visitor who is not signed in gets one genuine answer here. That is the
 * whole pitch of the product delivered in the place the pitch is made, and it
 * is worth far more than a screenshot of it.
 *
 * The card keeps its resting appearance exactly: the same seeded exchange, the
 * same composer. It only becomes interactive once someone types, so the hero
 * still reads as a product shot at a glance.
 *
 * Every limit is enforced server-side — see services/ai/demo.service. Nothing
 * here is load-bearing for cost.
 */

type Message = {
  role: "user" | "agent"
  text: string
}

const SEEDED: Message[] = [
  {
    role: "user",
    text: "Deploy my Next.js app from GitHub on the cheapest server.",
  },
  {
    role: "agent",
    text: "I can provision a server, configure Docker, enable HTTPS, and deploy it safely.",
  },
]

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001"
).replace(/\/+$/, "")

function Bubble({ message }: { message: Message }) {
  const agent = message.role === "agent"

  return (
    <li className="flex gap-3">
      <span
        className={
          agent
            ? "flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-brand/25 bg-brand-soft text-brand"
            : "flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-line-warm bg-canvas text-ink-muted"
        }
        aria-hidden
      >
        {agent ? <Terminal className="size-4" /> : <User className="size-4" />}
      </span>

      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-[-0.01em] text-ink-muted uppercase">
          {agent ? "TisiOps" : "You"}
        </p>
        <p
          className={
            agent
              ? "mt-1 text-base leading-relaxed text-ink-strong"
              : "mt-1 text-base leading-relaxed text-ink-default"
          }
        >
          {message.text}
        </p>
      </div>
    </li>
  )
}

export function ChatDemoCard() {
  const [messages, setMessages] = useState<Message[]>(SEEDED)
  const [prompt, setPrompt] = useState("")
  const [isAsking, setIsAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)

  async function ask() {
    const question = prompt.trim()
    if (!question || isAsking) return

    // The seeded exchange is an illustration; once someone asks for real it
    // steps aside rather than sitting above their own conversation.
    setMessages([{ role: "user", text: question }])
    setPrompt("")
    setError(null)
    setIsAsking(true)

    try {
      // Called directly rather than through lib/api: that helper attaches a
      // Clerk token, and this is the one route that must work without one.
      const response = await fetch(`${API_URL}/api/public/ai/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      })

      const body = await response.json()

      if (!response.ok || body?.success === false) {
        setError(body?.error ?? "The demo could not answer just now.")
        return
      }

      setMessages((current) => [
        ...current,
        { role: "agent", text: body.data.answer },
      ])
      setAnswered(true)
    } catch {
      setError("Could not reach TisiOps. Try again shortly.")
    } finally {
      setIsAsking(false)
    }
  }

  return (
    <div className="w-full rounded-lg border border-line bg-surface shadow-float">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <span
          className={`size-2 rounded-full bg-brand ${
            isAsking ? "motion-safe:animate-pulse" : ""
          }`}
          aria-hidden
        />
        <span className="text-sm font-medium tracking-[-0.01em] text-ink-muted">
          TisiOps Agent
        </span>
        <span className="ml-auto text-xs text-ink-muted">
          {answered ? "Live answer" : "Try it — no sign-up"}
        </span>
      </div>

      <ul
        className="flex flex-col gap-5 p-5 sm:p-6"
        aria-live="polite"
        aria-busy={isAsking}
      >
        {messages.map((message, index) => (
          <Bubble key={`${message.role}-${index}`} message={message} />
        ))}

        {isAsking ? (
          <li className="flex items-center gap-3 text-sm text-ink-muted">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-brand/25 bg-brand-soft text-brand"
              aria-hidden
            >
              <Loader2 className="size-4 motion-safe:animate-spin" />
            </span>
            Thinking…
          </li>
        ) : null}
      </ul>

      {error ? (
        <p
          role="alert"
          className="mx-5 mb-4 rounded-[6px] border border-line-warm bg-canvas px-3.5 py-2.5 text-sm text-ink-default sm:mx-6"
        >
          {error}
        </p>
      ) : null}

      {answered ? (
        // The moment the pitch lands: they have seen it work, so the next step
        // is the only thing offered.
        <div className="border-t border-line px-5 py-4 sm:px-6">
          <p className="text-sm text-ink-muted">
            That was one free question. The full console plans and runs real
            deployments.
          </p>
          <Link
            href="/sign-up"
            className="mt-3 inline-flex h-10 items-center justify-center rounded-[6px] bg-brand px-4 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Continue in TisiOps
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void ask()
          }}
          className="flex items-center gap-3 border-t border-line px-5 py-3"
        >
          <label htmlFor="tisiops-demo" className="sr-only">
            Ask TisiOps Agent
          </label>
          <input
            id="tisiops-demo"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={isAsking}
            maxLength={400}
            placeholder="Ask TisiOps Agent to deploy…"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink-strong placeholder:text-ink-muted focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isAsking || prompt.trim().length === 0}
            aria-label="Send"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-brand text-white transition-colors duration-150 ease-out hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-[#ffd9ca]"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        </form>
      )}
    </div>
  )
}
