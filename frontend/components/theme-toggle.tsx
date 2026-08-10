"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"

import { switchTheme } from "@/lib/theme"

/**
 * True only after hydration.
 *
 * useSyncExternalStore rather than a state flag set in an effect: it returns
 * the server snapshot on the server and the client one after hydration, with
 * no render-triggering write. Nothing ever changes, so the subscribe callback
 * has nothing to do.
 */
const NEVER_CHANGES = () => () => {}

function useMounted(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false
  )
}

/**
 * Light/dark switch.
 *
 * The icon cannot be rendered until the client knows the resolved theme —
 * the server has no idea which one the visitor stored, and guessing produces a
 * hydration mismatch. A neutral placeholder of the same size holds the space
 * so nothing shifts when the real icon arrives.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()

  const base = `inline-flex size-9 items-center justify-center rounded-[6px] border border-line-warm bg-surface text-ink-default transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${className}`

  if (!mounted) {
    // Same box, no glyph: reserves the space without claiming a theme.
    return <span className={base} aria-hidden />
  }

  const dark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => switchTheme(setTheme, dark ? "light" : "dark")}
      aria-label="Toggle theme"
      title={`Switch to ${dark ? "light" : "dark"} mode`}
      className={base}
    >
      {dark ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </button>
  )
}

/** The sidebar variant: a labelled row rather than an icon button. */
export function ThemeToggleRow() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()

  const row =
    "flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-sm font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"

  if (!mounted) {
    return (
      <span className={row} aria-hidden>
        <span className="size-4 shrink-0" />
        Theme
      </span>
    )
  }

  const dark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => switchTheme(setTheme, dark ? "light" : "dark")}
      aria-label="Toggle theme"
      className={`${row} cursor-pointer`}
    >
      {dark ? (
        <Sun className="size-4 shrink-0" aria-hidden />
      ) : (
        <Moon className="size-4 shrink-0" aria-hidden />
      )}
      Theme
      <span className="ml-auto text-xs text-ink-muted">
        {dark ? "Dark" : "Light"}
      </span>
    </button>
  )
}
