import { Suspense } from "react"

import { LogsViewer } from "@/components/dashboard/logs-viewer"
import { requireFeature } from "@/lib/feature-guard"

export const metadata = { title: "Logs" }

export default async function Page() {
  await requireFeature("logs")

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col lg:h-[calc(100vh-5rem)]">
      <div className="mb-4 shrink-0">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-ink-strong">
          Logs
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Build, runtime, and agent logs for your deployments.
        </p>
      </div>

      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={null}>
        <LogsViewer />
      </Suspense>
    </div>
  )
}
