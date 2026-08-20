import { redact } from "../redaction"

export function safeSummary(value: string | null | undefined): string {
  return redact(String(value ?? "")).slice(0, 500)
}

export function hasAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase()
  return words.some((word) => lower.includes(word))
}
