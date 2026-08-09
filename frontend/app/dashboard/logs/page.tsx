import { Suspense } from "react"

import { LogsViewer } from "@/components/dashboard/logs-viewer"
import { requireFeature } from "@/lib/feature-guard"

export const metadata = { title: "Logs" }

export default async function Page() {
  await requireFeature("logs")

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
        Logs
      </h1>
      <p className="mt-2 mb-8 text-base text-ink-muted">
        Build, runtime, and agent logs for your deployments.
      </p>

      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={null}>
        <LogsViewer />
      </Suspense>
    </div>
  )
}
