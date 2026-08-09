import { Terminal, User } from "lucide-react"

const messages = [
  {
    role: "user" as const,
    name: "You",
    text: "Deploy my Next.js app from GitHub on the cheapest server.",
  },
  {
    role: "agent" as const,
    name: "TisiOps",
    text: "I can provision a server, configure Docker, enable HTTPS, and deploy it safely.",
  },
]

export function ChatDemoCard() {
  return (
    <div className="w-full rounded-lg border border-line bg-surface shadow-float">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <span className="size-2 rounded-full bg-brand" aria-hidden />
        <span className="text-sm font-medium tracking-[-0.01em] text-ink-muted">
          TisiOps Agent
        </span>
      </div>

      <ul className="flex flex-col gap-5 p-5 sm:p-6">
        {messages.map((message) => (
          <li key={message.role} className="flex gap-3">
            <span
              className={
                message.role === "agent"
                  ? "flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-brand/25 bg-brand-soft text-brand"
                  : "flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-line-warm bg-canvas text-ink-muted"
              }
              aria-hidden
            >
              {message.role === "agent" ? (
                <Terminal className="size-4" />
              ) : (
                <User className="size-4" />
              )}
            </span>

            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[-0.01em] text-ink-muted uppercase">
                {message.name}
              </p>
              <p
                className={
                  message.role === "agent"
                    ? "mt-1 text-base leading-relaxed text-ink-strong"
                    : "mt-1 text-base leading-relaxed text-ink-default"
                }
              >
                {message.text}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
        <p className="truncate text-sm text-ink-muted">
          <span className="font-medium text-brand">Ask TisiOps Agent</span> to
          deploy...
        </p>
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-[#ffd9ca] text-white">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </span>
      </div>
    </div>
  )
}
