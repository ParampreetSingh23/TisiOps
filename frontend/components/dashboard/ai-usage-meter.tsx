"use client"

import type { UsageSummary } from "@tisiops/server/services/ai/usage"

/**
 * Today's AI Console allowance, in the composer bar.
 *
 * Deliberately quiet: a counter someone reads once a week should not compete
 * with the thing they came to do. It sits at the composer's baseline in the
 * muted text already used there, and only takes colour when the allowance is
 * nearly gone — the one moment it is worth interrupting for.
 *
 * The server enforces every number here. This is a readout, not a gate.
 */
export function UsageMeter({ usage }: { usage: UsageSummary | null }) {
  if (!usage) return null

  if (usage.unlimited) {
    return (
      <span className="ml-auto text-xs text-ink-muted">
        Admin mode: unlimited AI Console usage
      </span>
    )
  }

  const messagesLeft = Math.max(0, usage.messagesLimit - usage.messagesUsed)
  // Warn on the last fifth, so the notice arrives while it is still useful.
  const low = messagesLeft <= Math.ceil(usage.messagesLimit / 5)

  return (
    <span
      className={`ml-auto text-xs tabular-nums ${
        usage.canSend
          ? low
            ? "text-brand"
            : "text-ink-muted"
          : "text-[#a8341f]"
      }`}
      title={`Tokens today: ${usage.tokensUsed.toLocaleString()} / ${usage.tokensLimit.toLocaleString()}`}
    >
      {usage.canSend
        ? `${usage.messagesUsed} / ${usage.messagesLimit} messages today`
        : "Daily limit reached — resets tomorrow"}
    </span>
  )
}
