"use client"

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { AwsConnect } from "@/components/deployment/aws-connect"
import { apiFetch } from "@/lib/api"
import {
  card,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "@/lib/ui"
import type { PlanLine } from "@tisiops/server/services/aws/plans"

type Options = {
  template: string
  label: string
  description: string
  regions: string[]
  instanceTypes: { type: string; specs: string }[]
  defaultInstanceType: string
  volumeSizeGb: { min: number; max: number; default: number }
  awsConnected: boolean
  awsAccountId: string | null
  costWarning: string
  networkWarning: string
  activeDeployments: number
}

type PlanResponse = {
  config: {
    projectName: string
    region: string
    instanceType: string
    volumeSizeGb: number
  }
  plan: PlanLine[]
  awsConnected: boolean
  costWarning: string
  networkWarning: string
  approveLabel: string
}

/**
 * The states this screen can be in.
 *
 * Each one maps to something that has actually happened, so there is no step
 * that advances on a timer and no percentage that is not a real count.
 */
type Stage = "connecting" | "configuring" | "planning" | "approving" | "queued"

const errorBox =
  "mt-3 rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] px-3 py-2.5 text-sm text-[#a8341f]"

const warningBox =
  "mt-3 flex gap-2 rounded-[6px] border border-line bg-brand-soft px-3 py-2.5 text-sm text-ink-default"

export function AwsServerFlow() {
  const [options, setOptions] = useState<Options | null>(null)
  const [stage, setStage] = useState<Stage>("configuring")
  const [error, setError] = useState<string | null>(null)

  const [projectName, setProjectName] = useState("")
  const [region, setRegion] = useState("")
  const [instanceType, setInstanceType] = useState("")
  const [volumeSizeGb, setVolumeSizeGb] = useState(20)

  const [proposal, setProposal] = useState<PlanResponse | null>(null)
  const [deploymentId, setDeploymentId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    apiFetch<Options>("/api/deployments/aws/options")
      .then((next) => {
        if (!active) return
        setOptions(next)
        setRegion(next.regions[0] ?? "")
        setInstanceType(next.defaultInstanceType)
        setVolumeSizeGb(next.volumeSizeGb.default)
        setStage(next.awsConnected ? "configuring" : "connecting")
      })
      .catch((cause: Error) => active && setError(cause.message))

    return () => {
      active = false
    }
  }, [])

  async function requestPlan() {
    setError(null)
    setStage("planning")

    try {
      const next = await apiFetch<PlanResponse>("/api/deployments/aws/plan", {
        method: "POST",
        body: JSON.stringify({
          projectName,
          region,
          instanceType,
          volumeSizeGb,
        }),
      })
      setProposal(next)
    } catch (cause) {
      setError((cause as Error).message)
      setStage("configuring")
    }
  }

  async function approve() {
    if (!proposal) return

    setError(null)
    setStage("approving")

    try {
      const created = await apiFetch<{ id: string }>(
        "/api/deployments/aws/deploy",
        { method: "POST", body: JSON.stringify(proposal.config) }
      )
      setDeploymentId(created.id)
      setStage("queued")
    } catch (cause) {
      setError((cause as Error).message)
      setStage("planning")
    }
  }

  if (error && !options) {
    return (
      <div className={`${card} mt-3`}>
        <p className="text-sm text-ink-default">{error}</p>
      </div>
    )
  }

  if (!options) {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        Loading server options…
      </p>
    )
  }

  if (stage === "queued" && deploymentId) {
    return (
      <div className={`${card} mt-3`}>
        <p className="flex items-center gap-2 text-sm text-ink-strong">
          <CheckCircle2 className="size-4 text-brand" aria-hidden />
          Server queued.
        </p>
        <p className="mt-1.5 text-sm text-ink-muted">
          A TisiOps worker is creating the instance in your AWS account. The
          deployment page shows each step as it finishes, and the address once
          the server answers.
        </p>
        <Link
          href={`/dashboard/deployments/${deploymentId}`}
          className={`${secondaryButton} mt-4`}
        >
          Deployment details
        </Link>
      </div>
    )
  }

  if (stage === "connecting") {
    return (
      <div className="mt-3">
        <AwsConnect
          onConnected={(connected) => {
            if (connected) {
              setOptions({ ...options, awsConnected: true })
            }
          }}
          onContinue={() => setStage("configuring")}
        />
      </div>
    )
  }

  // The plan, with approval. Nothing has been created yet.
  if (proposal) {
    const busy = stage === "approving"

    return (
      <div className={`${card} mt-3`}>
        <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          Deployment plan
        </p>

        <dl className="mt-3 flex flex-col gap-1.5">
          {proposal.plan.map((line) => (
            <div key={line.label} className="flex gap-3 text-sm">
              <dt className="w-36 shrink-0 text-ink-muted">{line.label}</dt>
              <dd className="min-w-0 font-mono break-all text-ink-strong">
                {line.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className={warningBox}>
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-brand"
            aria-hidden
          />
          {proposal.costWarning}
        </p>

        <p className={warningBox}>
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-brand"
            aria-hidden
          />
          {proposal.networkWarning}
        </p>

        {error ? (
          <p role="alert" className={errorBox}>
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => void approve()}
            disabled={busy}
            className={primaryButton}
          >
            {busy ? (
              <>
                <Loader2
                  className="mr-2 size-4 motion-safe:animate-spin"
                  aria-hidden
                />
                Creating server…
              </>
            ) : (
              proposal.approveLabel
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setProposal(null)
              setStage("configuring")
            }}
            disabled={busy}
            className={secondaryButton}
          >
            Change settings
          </button>
        </div>

        <p className="mt-2.5 text-xs text-ink-muted">
          Nothing is created until you approve.
        </p>
      </div>
    )
  }

  const planning = stage === "planning"
  const nameTooShort = projectName.trim().length < 3

  return (
    <div className={`${card} mt-3`}>
      <p className="text-sm text-ink-default">{options.description}</p>

      {options.awsAccountId ? (
        <p className="mt-2 text-sm text-ink-muted">
          Building in AWS account{" "}
          <span className="font-mono text-ink-strong">
            {options.awsAccountId}
          </span>
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 sm:max-w-xs">
          <label className={labelClass} htmlFor="aws-server-name">
            Server name
          </label>
          <input
            id="aws-server-name"
            className={inputClass}
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="my-server"
            maxLength={60}
            disabled={planning}
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            Letters, numbers and dashes. Used to tag the AWS resources.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="aws-server-region">
            Region
          </label>
          <select
            id="aws-server-region"
            className={inputClass}
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            disabled={planning}
          >
            {options.regions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="aws-server-instance">
            Instance type
          </label>
          <select
            id="aws-server-instance"
            className={inputClass}
            value={instanceType}
            onChange={(event) => setInstanceType(event.target.value)}
            disabled={planning}
          >
            {options.instanceTypes.map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.type} — {entry.specs}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="aws-server-volume">
            Disk size (GB)
          </label>
          <input
            id="aws-server-volume"
            type="number"
            className={inputClass}
            value={volumeSizeGb}
            min={options.volumeSizeGb.min}
            max={options.volumeSizeGb.max}
            step={1}
            onChange={(event) =>
              setVolumeSizeGb(Number.parseInt(event.target.value, 10) || 0)
            }
            disabled={planning}
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            Between {options.volumeSizeGb.min} and {options.volumeSizeGb.max} GB.
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className={errorBox}>
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void requestPlan()}
        disabled={planning || nameTooShort}
        className={`${primaryButton} mt-4`}
      >
        {planning ? (
          <>
            <Loader2
              className="mr-2 size-4 motion-safe:animate-spin"
              aria-hidden
            />
            Building the plan…
          </>
        ) : (
          "Review plan"
        )}
      </button>

      <p className="mt-2.5 text-xs text-ink-muted">
        Reviewing the plan creates nothing and calls no AWS API.
      </p>
    </div>
  )
}
