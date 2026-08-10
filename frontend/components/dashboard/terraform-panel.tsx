"use client"

import { AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"

import { apiFetch } from "@/lib/api"
import { card } from "@/lib/ui"
import type { AgentPlan } from "@tisiops/server/services/terraform/agent"
import type { TerraformInspection } from "@tisiops/server/services/terraform/inspection"

/**
 * What the Terraform Agent knows about this deployment's infrastructure.
 *
 * Read-only. Stop, start, and delete live in DeploymentActions, which every
 * deployment type shares — keeping them there means one set of confirmation
 * rules rather than one per provider.
 */

type Inspection = TerraformInspection & {
  explanation: string
  retryPlan: AgentPlan | null
  cleanupPlan: AgentPlan | null
  drift: AgentPlan | null
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1 font-mono text-sm break-all text-ink-strong">
        {value}
      </dd>
    </div>
  )
}

export function TerraformPanel({ id }: { id: string }) {
  const [data, setData] = useState<Inspection | null>(null)

  useEffect(() => {
    let active = true

    apiFetch<Inspection>(`/api/deployments/${id}/terraform`)
      .then((next) => active && setData(next))
      // A Vercel deployment has no Terraform record; the panel simply hides.
      .catch(() => active && setData(null))

    return () => {
      active = false
    }
  }, [id])

  if (!data?.template) return null

  return (
    <div className={`${card} mt-4`}>
      <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
        Infrastructure
      </p>

      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Terraform template" value={data.template} />
        <Field label="Region" value={data.server?.region ?? "—"} />
        <Field label="Instance type" value={data.server?.instanceType ?? "—"} />
        <Field
          label="EC2 instance"
          value={data.server?.instanceId ?? "not recorded"}
        />
        <Field
          label="Elastic IP"
          value={data.server?.elasticIp ?? "not attached"}
        />
        <Field
          label="Security group"
          value={data.server?.securityGroupId ?? "not recorded"}
        />
      </dl>

      <div className="mt-4 border-t border-line pt-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Server state"
            value={data.server?.status?.toLowerCase() ?? "—"}
          />
          <Field
            label="State"
            value={
              data.state.backend === "s3"
                ? `remote — ${data.state.key}`
                : `local (development only) — ${data.state.key}`
            }
          />
        </dl>
        <dl className="mt-3">
          <Field label="Last plan" value={data.planSummary ?? "—"} />
        </dl>
      </div>

      {data.diagnosis ? (
        <div className="mt-4 rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] px-4 py-3 text-sm">
          <p className="font-medium text-[#a8341f]">{data.diagnosis.message}</p>
          {data.diagnosis.nextStep ? (
            <p className="mt-1 text-ink-default">{data.diagnosis.nextStep}</p>
          ) : null}
        </div>
      ) : null}

      {data.drift ? (
        <div className="mt-4 rounded-[6px] border border-line bg-brand-soft px-4 py-3 text-sm">
          <p className="flex gap-2 font-medium text-ink-strong">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-brand"
              aria-hidden
            />
            {data.drift.title}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1 text-ink-default">
            {data.drift.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
