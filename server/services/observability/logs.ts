import { redact } from "../redaction"

export function maskConnectionString(value: string): string {
  return redact(value)
}

export function sanitizeTelemetryValue(value: unknown): unknown {
  if (typeof value === "string") return redact(value).slice(0, 500)
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value
  if (Array.isArray(value)) return value.map(sanitizeTelemetryValue).slice(0, 20)
  if (typeof value === "object" && value) return sanitizeLogMetadata(value as Record<string, unknown>)
  return null
}

export function sanitizeLogMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      /password|secret|token|key|url/i.test(key)
        ? redact(`${key}=${String(value)}`).split("=").slice(1).join("=")
        : sanitizeTelemetryValue(value),
    ])
  )
}
