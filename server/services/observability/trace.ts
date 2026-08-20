import {
  SpanStatusCode,
  trace,
  context,
  type Attributes,
  type Span,
} from "@opentelemetry/api"

import type { SafeTelemetryAttrs } from "./telemetry.types"

const tracer = trace.getTracer("tisiops")

export function otelAttrs(input: SafeTelemetryAttrs = {}): Attributes {
  return Object.fromEntries(
    Object.entries({
      deploymentId: input.deploymentId,
      deploymentJobId: input.deploymentJobId,
      userId: input.userId,
      templateId: input.templateId,
      provider: input.provider,
      jobType: input.jobType,
      workerId: input.workerId,
      errorCode: input.errorCode,
    }).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ) as Attributes
}

export async function withSpan<T>(
  name: string,
  attributes: SafeTelemetryAttrs,
  run: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes: otelAttrs(attributes) }, async (span) => {
    try {
      const result = await run(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (cause) {
      span.recordException(cause as Error)
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: cause instanceof Error ? cause.message : "unknown error",
      })
      throw cause
    } finally {
      span.end()
    }
  }) as Promise<T>
}

export function activeTraceIds() {
  const span = trace.getSpan(context.active())
  const spanContext = span?.spanContext()
  return {
    traceId: spanContext?.traceId ?? null,
    spanId: spanContext?.spanId ?? null,
  }
}
