"use client"

import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { DeploymentStatus } from "@/components/dashboard/deployment-status"
import { N8nProgressView } from "@/components/dashboard/n8n-progress"
import { apiFetch } from "@/lib/api"
import { card } from "@/lib/ui"
import type { SafeDeployment } from "@tisiops/server/services/deployments"

/**
 * Picks the detail view that matches the deployment.
 *
 * A managed server and a Vercel preview have almost nothing in common on
 * screen — one has a repository and a build, the other has a machine and a
 * timeline — so they get separate views rather than one with half its fields
 * blank.
 */
export function DeploymentDetail({ id }: { id: string }) {
  const [type, setType] = useState<SafeDeployment["type"] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true

    apiFetch<SafeDeployment>(`/api/deployments/${id}`)
      .then((next) => active && setType(next.type))
      .catch(() => active && setFailed(true))

    return () => {
      active = false
    }
  }, [id])

  // The Vercel view fetches the same deployment itself and renders its own
  // "not found", so a failure here just falls through to it.
  if (failed) return <DeploymentStatus id={id} />

  if (!type) {
    return (
      <div className={`${card} flex items-center gap-2 text-sm text-ink-muted`}>
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        Loading deployment…
      </div>
    )
  }

  return type === "N8N" ? (
    <N8nProgressView id={id} />
  ) : (
    <DeploymentStatus id={id} />
  )
}
