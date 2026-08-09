"use client"

import { Check, ChevronDown } from "lucide-react"
import { Select as RadixSelect } from "radix-ui"

/**
 * Branded select.
 *
 * A native <select> renders its open list with the operating system, which no
 * CSS can reach — that is why it appeared dark grey with a blue highlight
 * against a light orange product. Radix draws the list in the page instead, so
 * it takes DESIGN.md's tokens, and keeps the keyboard and screen-reader
 * behaviour the native control gave us for free.
 */

export type SelectOption = {
  value: string
  label: string
  /** Secondary text, shown quieter after the label. */
  hint?: string
}

export function Select({
  value,
  onValueChange,
  options,
  label,
  className = "",
}: {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  /** Accessible name, used when no visible <label> wraps the trigger. */
  label?: string
  className?: string
}) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange}>
      <RadixSelect.Trigger
        aria-label={label}
        className={`mt-1.5 flex h-10 w-full items-center justify-between gap-2 rounded-[6px] border border-line-warm bg-surface px-3 text-left text-sm text-ink-strong transition-colors duration-150 ease-out outline-none focus-visible:border-brand data-[state=open]:border-brand ${className}`}
      >
        <RadixSelect.Value />
        <RadixSelect.Icon>
          <ChevronDown className="size-4 shrink-0 text-ink-muted" aria-hidden />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          // Anchored to the trigger and matched to its width, so the list reads
          // as an extension of the field rather than a floating panel.
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[6px] border border-line bg-surface shadow-float"
        >
          <RadixSelect.Viewport className="scrollbar-subtle p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className="flex cursor-default items-center gap-2 rounded-[4px] px-2.5 py-2 text-sm text-ink-default outline-none select-none data-[highlighted]:bg-brand-soft data-[highlighted]:text-brand data-[state=checked]:font-medium data-[state=checked]:text-brand"
              >
                {/* Fixed slot: the indicator only renders when checked, so the
                    space is reserved here to keep every label aligned. */}
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <RadixSelect.ItemIndicator>
                    <Check className="size-3.5" aria-hidden />
                  </RadixSelect.ItemIndicator>
                </span>
                {/* Both parts sit inside ItemText: Radix clones its children
                    into the trigger, so the closed control shows the hint too. */}
                <RadixSelect.ItemText>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="truncate text-xs text-ink-muted">
                        {option.hint}
                      </span>
                    ) : null}
                  </span>
                </RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
