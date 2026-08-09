"use client"

import { useTransition } from "react"

import { updateFeatureStatus } from "@/app/dashboard/admin/actions"
import {
  FEATURE_STATUSES,
  type Feature,
  type FeatureStatus,
} from "@/lib/features"

const statusStyles: Record<FeatureStatus, string> = {
  enabled: "bg-brand-soft text-brand",
  disabled: "bg-canvas text-ink-muted",
  locked: "bg-canvas text-ink-strong",
}

export function FeatureFlags({ features }: { features: Feature[] }) {
  const [isPending, startTransition] = useTransition()

  return (
    <div
      className={`overflow-hidden rounded-lg border border-line bg-surface shadow-card transition-opacity duration-150 ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <ul>
        {features.map((feature) => (
          <li
            key={feature.key}
            className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-semibold tracking-[-0.01em] text-ink-strong">
                  {feature.name}
                </h3>
                <span
                  className={`rounded-[4px] px-2 py-0.5 text-xs font-semibold capitalize ${statusStyles[feature.status]}`}
                >
                  {feature.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {feature.description}
              </p>
            </div>

            <div
              role="group"
              aria-label={`${feature.name} status`}
              className="flex shrink-0 rounded-[6px] border border-line-warm"
            >
              {FEATURE_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={isPending}
                  aria-pressed={feature.status === status}
                  onClick={() =>
                    startTransition(async () => {
                      await updateFeatureStatus(feature.key, status)
                    })
                  }
                  className={`h-8 px-3 text-xs font-semibold capitalize transition-colors duration-150 ease-out first:rounded-l-[5px] last:rounded-r-[5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed ${
                    feature.status === status
                      ? "bg-brand text-white"
                      : "text-ink-default hover:bg-canvas"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
