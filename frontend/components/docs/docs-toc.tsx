"use client"

import { Check, Smile, Meh, Frown } from "lucide-react"
import { useState } from "react"

const TOC_ITEMS = [
  { label: "What is TisiOps?", href: "#introduction" },
  { label: "Quickstart", href: "#quickstart" },
  { label: "AI Console", href: "#ai-console" },
  { label: "Deployments", href: "#vercel-frontend" },
  { label: "n8n Managed Server", href: "#n8n-managed-server" },
  { label: "Safety Model", href: "#security" },
  { label: "FAQ", href: "#faq" },
]

export function DocsToc() {
  const [feedback, setFeedback] = useState<"happy" | "neutral" | "sad" | null>(
    null
  )

  return (
    <aside className="hidden w-56 shrink-0 lg:block lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto lg:p-5">
      <div className="flex flex-col gap-6">
        <div>
          <h4 className="text-[11px] font-semibold tracking-wider text-ink-muted uppercase">
            On this page
          </h4>
          <ul className="mt-3 flex flex-col gap-2 border-l border-line pl-3">
            {TOC_ITEMS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="block text-xs font-medium text-ink-muted transition-colors hover:text-brand"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Feedback card */}
        <div className="rounded-[8px] border border-line bg-surface p-3.5">
          <p className="text-xs font-medium text-ink-strong">
            Was this page helpful?
          </p>

          {feedback ? (
            <p className="mt-2.5 flex items-center gap-1.5 text-xs text-[#0f6b4f]">
              <Check className="size-3.5" /> Thanks for your feedback!
            </p>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFeedback("happy")}
                className="flex size-8 items-center justify-center rounded-[6px] border border-line bg-canvas text-base transition-transform hover:scale-110 hover:border-brand"
                title="Helpful"
              >
                😀
              </button>
              <button
                type="button"
                onClick={() => setFeedback("neutral")}
                className="flex size-8 items-center justify-center rounded-[6px] border border-line bg-canvas text-base transition-transform hover:scale-110 hover:border-brand"
                title="Somewhat helpful"
              >
                😐
              </button>
              <button
                type="button"
                onClick={() => setFeedback("sad")}
                className="flex size-8 items-center justify-center rounded-[6px] border border-line bg-canvas text-base transition-transform hover:scale-110 hover:border-brand"
                title="Not helpful"
              >
                😞
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
