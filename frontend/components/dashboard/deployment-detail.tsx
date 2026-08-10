"use client"

import { Copy, Eye, Loader2 } from "lucide-react"
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
  ) : type === "POSTGRES" ? (
    <PostgresDetail id={id} />
  ) : (
    <DeploymentStatus id={id} />
  )
}

type PostgresConnection = {
  type: string
  access: string
  host: string | null
  port: number
  database: string
  user: string
  persistence: boolean
  maskedDatabaseUrl: string
  databaseUrl: string | null
  password: string | null
  warning: string
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="mt-1 font-mono text-sm break-all text-ink-strong">
        {value}
      </dd>
    </div>
  )
}

function PostgresDetail({ id }: { id: string }) {
  const [connection, setConnection] = useState<PostgresConnection | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    apiFetch<PostgresConnection>(`/api/deployments/${id}/postgres/connection`)
      .then((next) => active && setConnection(next))
      .catch((cause: Error) => active && setError(cause.message))
    return () => {
      active = false
    }
  }, [id])

  async function reveal() {
    const next = await apiFetch<PostgresConnection>(
      `/api/deployments/${id}/postgres/connection?reveal=true`
    )
    setConnection(next)
    setRevealed(true)
  }

  if (error) return <DeploymentStatus id={id} />

  if (!connection) {
    return (
      <div className={`${card} flex items-center gap-2 text-sm text-ink-muted`}>
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        Loading PostgreSQL details…
      </div>
    )
  }

  const copyValue = connection.databaseUrl ?? connection.maskedDatabaseUrl

  return (
    <div className="space-y-4">
      <DeploymentStatus id={id} />

      <section className={card}>
        <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
          PostgreSQL Managed Server
        </h2>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Access" value={connection.access} />
          <Field label="Host" value={connection.host ?? "Provisioning"} />
          <Field label="Port" value={String(connection.port)} />
          <Field label="Database" value={connection.database} />
          <Field label="User" value={connection.user} />
          <Field
            label="Persistence"
            value={connection.persistence ? "Enabled" : "Disabled"}
          />
        </dl>

        <p className="mt-4 rounded-[6px] border border-line bg-brand-soft px-3 py-2.5 text-sm text-ink-default">
          {connection.warning}
        </p>
      </section>

      <section className={card}>
        <h2 className="font-heading text-base font-medium tracking-[-0.02em] text-ink-strong">
          DATABASE_URL
        </h2>
        <p className="mt-3 rounded-[6px] border border-line bg-canvas p-3 font-mono text-sm break-all text-ink-strong">
          {connection.databaseUrl ?? connection.maskedDatabaseUrl}
        </p>

        {revealed && connection.password ? (
          <p className="mt-3 font-mono text-sm break-all text-ink-strong">
            Password: {connection.password}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(copyValue)}
            className="inline-flex h-9 items-center rounded-[6px] border border-line-warm bg-surface px-3 text-sm font-medium text-ink-default transition-colors hover:bg-canvas"
          >
            <Copy className="mr-2 size-4" aria-hidden />
            Copy DATABASE_URL
          </button>
          <button
            type="button"
            onClick={() => void reveal()}
            className="inline-flex h-9 items-center rounded-[6px] border border-line-warm bg-surface px-3 text-sm font-medium text-ink-default transition-colors hover:bg-canvas"
          >
            <Eye className="mr-2 size-4" aria-hidden />
            Reveal password
          </button>
        </div>
      </section>
    </div>
  )
}
