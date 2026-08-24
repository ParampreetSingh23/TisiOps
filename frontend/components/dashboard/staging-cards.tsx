"use client"

import { Check, GitBranch, Server, TriangleAlert } from "lucide-react"

import { card, primaryButton, secondaryButton } from "@/lib/ui"

/**
 * Renders a staging_flow turn: the target choices (Where should staging run?),
 * the compatibility verdict, and the final plan with an approve action.
 *
 * Live-turn only, like the other cards — the transcript keeps the text, not
 * these findings.
 */

type TargetOption = {
  target: "NEW_SERVER" | "EXISTING_SERVER" | "SAME_SERVER"
  label: string
  description: string
  recommended: boolean
  risk: "low" | "medium" | "high"
}

type SourceOption = {
  sourceType: "STAGING_SOURCE_SERVER" | "STAGING_SOURCE_REPOSITORY"
  label: string
  description: string
}

type CompatibilityCheck = { label: string; required: string; available: string; ok: boolean }
type Compatibility = { compatible: boolean; checks: CompatibilityCheck[]; reason: string }

type FinalPlan = {
  source: string
  repository: string | null
  productionBranch: string | null
  stagingBranch: string
  target: string
  region: string
  resources: { cpu: number; memoryGb: number; diskGb: number }
  runtime: string | null
  services: string[]
  isolation: {
    database: boolean
    redis: boolean
    volumes: boolean
    environment: boolean
    domain: boolean
  }
  domain: string
  actions: string[]
}

type StagingData = {
  intent: string
  message: string
  sourceOptions?: SourceOption[]
  targetOptions?: TargetOption[]
  compatibility?: Compatibility
  finalPlan?: FinalPlan
}

export type { StagingData }

const PROMPT_FOR: Record<TargetOption["target"], string> = {
  NEW_SERVER: "create a new server",
  EXISTING_SERVER: "use an existing server",
  SAME_SERVER: "same production server",
}

const SOURCE_PROMPT_FOR: Record<SourceOption["sourceType"], string> = {
  STAGING_SOURCE_SERVER: "Existing Server",
  STAGING_SOURCE_REPOSITORY: "GitHub Repository",
}

export function StagingCards({
  data,
  onAsk,
}: {
  data: StagingData
  onAsk: (text: string) => void
}) {
  if (data.sourceOptions) {
    return (
      <div className={card}>
        <div className="flex items-center gap-2.5">
          <GitBranch className="size-4 shrink-0 text-brand" aria-hidden />
          <h4 className="text-sm font-semibold text-ink-strong">
            Choose staging source
          </h4>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {data.sourceOptions.map((option) => (
            <button
              key={option.sourceType}
              type="button"
              onClick={() => onAsk(SOURCE_PROMPT_FOR[option.sourceType])}
              className="flex w-full items-start gap-3 rounded-[6px] border border-line-warm px-3.5 py-3 text-left transition-colors duration-150 ease-out hover:border-brand"
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink-strong">
                  {option.label}
                </span>
                <span className="block text-sm text-ink-muted">
                  {option.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Target selection: three options, recommended highlighted.
  if (data.targetOptions && !data.finalPlan) {
    return (
      <div className={card}>
        <div className="flex items-center gap-2.5">
          <Server className="size-4 shrink-0 text-brand" aria-hidden />
          <h4 className="text-sm font-semibold text-ink-strong">
            Where should staging run?
          </h4>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {data.targetOptions.map((option) => (
            <button
              key={option.target}
              type="button"
              onClick={() => onAsk(PROMPT_FOR[option.target])}
              className="flex w-full items-start gap-3 rounded-[6px] border border-line-warm px-3.5 py-3 text-left transition-colors duration-150 ease-out hover:border-brand"
            >
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${
                  option.recommended
                    ? "bg-brand text-white"
                    : "border border-line text-ink-muted"
                }`}
              >
                {option.recommended ? <Check className="size-3" aria-hidden /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink-strong">
                  {option.label}
                  {option.recommended ? (
                    <span className="ml-2 rounded-[4px] bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand">
                      Recommended
                    </span>
                  ) : null}
                </span>
                <span className="block text-sm text-ink-muted">
                  {option.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Incompatible target: show why.
  if (data.compatibility && !data.compatibility.compatible) {
    const checks = data.compatibility.checks.filter((check) => !check.ok)
    return (
      <div className={card}>
        <div className="flex items-center gap-2.5">
          <TriangleAlert className="size-4 shrink-0 text-brand" aria-hidden />
          <h4 className="text-sm font-semibold text-ink-strong">
            Target cannot support staging
          </h4>
        </div>
        {data.compatibility.reason ? (
          <p className="mt-2 text-sm text-ink-default">
            {data.compatibility.reason}
          </p>
        ) : null}
        {checks.length > 0 ? (
          <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {checks.map((check) => (
              <Row key={check.label} label={check.label} value={`${check.required} (${check.available})`} />
            ))}
          </dl>
        ) : null}
        <div className="mt-4">
          <button type="button" onClick={() => onAsk("where should staging run")} className={secondaryButton}>
            Pick a different target
          </button>
        </div>
      </div>
    )
  }

  // Final plan: the approval boundary.
  if (data.finalPlan) {
    const plan = data.finalPlan
    return (
      <div className={card}>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-ink-strong">Staging plan</h4>
          <span className="rounded-[4px] border border-line-warm px-2 py-0.5 text-xs font-medium text-ink-muted">
            {plan.target.replace(/_/g, " ")}
          </span>
        </div>

        <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <Row label="Source" value={plan.source} />
          <Row label="Repository" value={plan.repository ?? "Not set"} />
          <Row label="Branches" value={plan.productionBranch ?? "main"} />
          <Row label="Staging branch" value={plan.stagingBranch} />
          <Row label="Runtime" value={plan.runtime ?? "Not detected"} />
          <Row
            label="Resources"
            value={`${plan.resources.cpu} vCPU · ${plan.resources.memoryGb} GB · ${plan.resources.diskGb} GB`}
          />
          <Row
            label="Services"
            value={plan.services.length > 0 ? plan.services.join(", ") : "—"}
          />
          <Row label="Domain" value={plan.domain} />
        </dl>

        <Isolation isolation={plan.isolation} />

        <div className="mt-4">
          <button type="button" onClick={() => onAsk("approve staging")} className={primaryButton}>
            Approve & Create Staging
          </button>
        </div>
      </div>
    )
  }

  return null
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-28 shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 font-medium break-words text-ink-strong">{value}</dd>
    </div>
  )
}

function Isolation({
  isolation,
}: {
  isolation: {
    database: boolean
    redis: boolean
    volumes: boolean
    environment: boolean
    domain: boolean
  }
}) {
  const items: string[] = []
  if (isolation.database) items.push("Separate database")
  if (isolation.redis) items.push("Separate Redis")
  if (isolation.volumes) items.push("Separate volumes")
  if (isolation.environment) items.push("Separate environment")
  if (isolation.domain) items.push("Separate domain")

  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-1.5 text-sm text-ink-default">
          <Check className="size-3.5 text-brand" aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  )
}
