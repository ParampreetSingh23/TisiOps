"use client"

import { useTransition } from "react"

import { updateProviderAvailability } from "@/app/dashboard/admin/actions"
import { ProviderIcon } from "@/components/deployment/provider-icon"
import type { Provider } from "@/lib/providers"

export function ProviderFlags({ providers }: { providers: Provider[] }) {
  const [isPending, startTransition] = useTransition()

  return (
    <div
      className={`overflow-hidden rounded-lg border border-line bg-surface shadow-card transition-opacity duration-150 ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <ul>
        {providers.map((provider) => (
          <li
            key={provider.id}
            className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 last:border-b-0"
          >
            <ProviderIcon id={provider.id} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-semibold tracking-[-0.01em] text-ink-strong">
                  {provider.name}
                </h3>
                <span
                  className={`rounded-[4px] px-2 py-0.5 text-xs font-semibold ${
                    provider.available
                      ? "bg-brand-soft text-brand"
                      : "bg-canvas text-ink-muted"
                  }`}
                >
                  {provider.available ? "Available" : "Coming Soon"}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {provider.description}
              </p>
            </div>

            <div
              role="group"
              aria-label={`${provider.name} availability`}
              className="flex shrink-0 rounded-[6px] border border-line-warm"
            >
              {[true, false].map((available) => (
                <button
                  key={String(available)}
                  type="button"
                  disabled={isPending}
                  aria-pressed={provider.available === available}
                  onClick={() =>
                    startTransition(async () => {
                      await updateProviderAvailability(provider.id, available)
                    })
                  }
                  className={`h-8 px-3 text-xs font-semibold transition-colors duration-150 ease-out first:rounded-l-[5px] last:rounded-r-[5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed ${
                    provider.available === available
                      ? "bg-brand text-white"
                      : "text-ink-default hover:bg-canvas"
                  }`}
                >
                  {available ? "Available" : "Coming Soon"}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
