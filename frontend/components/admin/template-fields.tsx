"use client"

import { Plus, Trash2 } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Form primitives for the admin template creator.
 *
 * They exist so the creator reads as the manifest it edits — a list of fields,
 * not a list of divs — and so every control in the tab lands on the same
 * height, radius, and focus treatment from DESIGN.md.
 */

const control =
  "h-9 w-full rounded-[6px] border border-line-warm bg-surface px-2.5 text-sm text-ink-strong outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand"

export const labelText =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted"

const buttonBase =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[6px] whitespace-nowrap text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed"

// A disabled action goes flat rather than translucent-orange: a faded brand fill
// still reads as the thing to press.
const disabledFlat =
  "disabled:border disabled:border-line disabled:bg-canvas disabled:text-ink-muted"

export const primaryButton = `${buttonBase} ${disabledFlat} h-9 bg-brand px-3.5 text-white hover:bg-brand-hover`
export const ghostButton = `${buttonBase} ${disabledFlat} h-9 border border-line-warm bg-surface px-3.5 text-ink-default hover:bg-canvas`
export const tinyButton = `${buttonBase} h-7 border border-line px-2 text-xs font-medium text-ink-muted hover:bg-canvas hover:text-ink-strong disabled:opacity-40`

export function Field({
  label,
  hint,
  span,
  children,
}: {
  label: string
  hint?: string
  span?: boolean
  children: ReactNode
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${span ? "sm:col-span-2" : ""}`}>
      <span className={labelText}>{label}</span>
      {children}
      {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
    </label>
  )
}

export function Text({
  label,
  value,
  onChange,
  placeholder,
  hint,
  mono,
  span,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  mono?: boolean
  span?: boolean
}) {
  return (
    <Field label={label} hint={hint} span={span}>
      <input
        className={`${control} ${mono ? "font-mono text-[13px]" : ""}`}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
    </Field>
  )
}

export function Num({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className={`${control} font-mono text-[13px]`}
        type="number"
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </Field>
  )
}

export function Pick<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  span,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  hint?: string
  span?: boolean
}) {
  return (
    <Field label={label} hint={hint} span={span}>
      <select
        className={control}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function Area({
  label,
  value,
  onChange,
  rows = 4,
  mono,
  span,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  mono?: boolean
  span?: boolean
  hint?: string
}) {
  return (
    <Field label={label} hint={hint} span={span}>
      <textarea
        className={`w-full rounded-[6px] border border-line-warm bg-surface p-2.5 text-sm leading-6 text-ink-strong outline-none transition-colors focus:border-brand ${
          mono ? "font-mono text-[13px] leading-5" : ""
        }`}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
    </Field>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-default">
      <input
        type="checkbox"
        className="size-3.5 accent-brand"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

/** A comma-separated list of numbers, kept as text while it is being typed. */
export function Ports({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: number[]
  onChange: (value: number[]) => void
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className={`${control} font-mono text-[13px]`}
        value={value.join(", ")}
        placeholder="80, 443"
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((part) => Number(part.trim()))
              .filter((port) => Number.isFinite(port) && port > 0)
          )
        }
      />
    </Field>
  )
}

export function List({
  label,
  value,
  onChange,
  placeholder,
  hint,
  span,
}: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  hint?: string
  span?: boolean
}) {
  return (
    <Field label={label} hint={hint} span={span}>
      <input
        className={control}
        value={value.join(", ")}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean)
          )
        }
      />
    </Field>
  )
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>
}

/**
 * A run of fields under a titled rule. Deliberately not a card: the section
 * already sits inside a pane, and a card inside a card inside a card is how the
 * first pass ended up reading as boxes rather than a form.
 */
export function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-5 flex items-start justify-between gap-6 border-b border-line pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-strong">{title}</h2>
          {hint ? (
            <p className="mt-1 max-w-prose text-xs leading-5 text-ink-muted">
              {hint}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A titled block in a side rail: same rule treatment, tighter. */
export function Pane({
  title,
  hint,
  icon,
  children,
}: {
  title: string
  hint?: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-b border-line p-5 last:border-b-0">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-strong">
        {icon}
        {title}
      </h2>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
      {children}
    </section>
  )
}

/** One entry in a repeatable list: numbered, removable, quiet until hovered. */
export function Entry({
  index,
  title,
  onRemove,
  children,
}: {
  index: number
  title: string
  onRemove?: () => void
  children: ReactNode
}) {
  return (
    <div className="group rounded-[6px] border border-line bg-canvas/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-ink-strong">
          <span className="font-mono text-[11px] text-ink-muted">
            {String(index + 1).padStart(2, "0")}
          </span>
          {title}
        </p>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${title}`}
            className="rounded-[4px] p-1 text-ink-muted opacity-0 transition-opacity hover:text-[#c4422a] focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export function AddButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" className={tinyButton} onClick={onClick}>
      <Plus className="size-3.5" aria-hidden />
      {label}
    </button>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[6px] border border-dashed border-line-warm px-4 py-6 text-center text-sm text-ink-muted">
      {children}
    </p>
  )
}
