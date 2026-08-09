import { Plus } from "lucide-react"
import Link from "next/link"

import { ServerStack } from "@/components/dashboard/server-stack"
import { requireFeature } from "@/lib/feature-guard"

// ponytail: no server records exist yet. Swap for the real query when servers persist.
const servers: { id: string; name: string }[] = []

export default async function ServersPage() {
  await requireFeature("servers")

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
            Servers
          </h1>
          <p className="mt-2 text-base text-ink-muted">
            Servers connected to your workspace and their health.
          </p>
        </div>

        <Link
          href="/dashboard/new-deployment/create"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-[6px] bg-brand px-4 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:bg-brand-active"
        >
          <Plus className="mr-1.5 size-4" aria-hidden />
          New Server
        </Link>
      </div>

      {servers.length === 0 ? (
        <div className="flex min-h-[58vh] flex-col items-center justify-center py-16 text-center">
          <ServerStack className="w-44 text-ink-muted/45" />
          <p className="mt-8 max-w-sm text-base text-ink-muted">
            Connect your first server to deploy and monitor apps with TisiOps.
          </p>
          <Link
            href="/dashboard/new-deployment/create"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-[6px] border border-line-warm bg-surface px-4 text-sm font-medium text-ink-default transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted"
          >
            Connect a server
          </Link>
        </div>
      ) : null}
    </div>
  )
}
