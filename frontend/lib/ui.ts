/**
 * Shared control classes for dashboard surfaces, per DESIGN.md: flat white
 * cards, 1px borders, compact radii, orange as the only accent.
 */

export const card = "rounded-lg border border-line bg-surface p-5 shadow-card"

export const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-[6px] bg-brand px-4 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-hover active:bg-brand-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"

export const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-[6px] border border-line-warm bg-surface px-4 text-sm font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted disabled:cursor-not-allowed disabled:opacity-50"

export const inputClass =
  "mt-1.5 h-10 w-full rounded-[6px] border border-line-warm bg-surface px-3 text-sm text-ink-strong placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-none"

export const labelClass = "text-sm font-medium text-ink-strong"
