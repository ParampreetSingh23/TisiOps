/**
 * Theme switching with a cross-fade.
 *
 * The transition is defined in globals.css and only applies while
 * `.theme-switching` is on <html>. Putting it on for the duration of the
 * change — rather than leaving a global transition in place — keeps every
 * hover and focus state at its own speed.
 *
 * Shared so the navbar button, the sidebar row, and the keyboard shortcut all
 * animate identically instead of each doing their own thing.
 */

const CLASS = "theme-switching"
const DURATION = 240

let timer: ReturnType<typeof setTimeout> | null = null

export function switchTheme(
  setTheme: (theme: string) => void,
  next: "light" | "dark"
): void {
  if (typeof document === "undefined") {
    setTheme(next)
    return
  }

  const root = document.documentElement

  // Someone toggling repeatedly should not have the class removed by the
  // first switch's timer while a later one is still running.
  if (timer) clearTimeout(timer)
  root.classList.add(CLASS)

  setTheme(next)

  timer = setTimeout(() => {
    root.classList.remove(CLASS)
    timer = null
  }, DURATION)
}
