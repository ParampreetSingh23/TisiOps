import { activeTraceIds } from "./trace"
import { sanitizeLogMetadata } from "./logs"

type AppLogLevel = "debug" | "info" | "warn" | "error"

export function appLog(
  level: AppLogLevel,
  message: string,
  attributes: Record<string, unknown> = {}
) {
  const ids = activeTraceIds()
  const sanitized = sanitizeLogMetadata(attributes)

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      traceId: ids.traceId,
      spanId: ids.spanId,
      ...sanitized,
    })
  )
}
