"use client"

import { SiN8n, SiN8nHex } from "@icons-pack/react-simple-icons"
import { AlertTriangle, ArrowLeft, Check, Loader2, Server } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { ProviderIcon } from "@/components/deployment/provider-icon"
import { Select } from "@/components/ui/select"
import { apiFetch } from "@/lib/api"
import {
  card,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "@/lib/ui"
import type { DeploymentPlan } from "@tisiops/server/services/n8n/planner"
import type { ServerPlan } from "@tisiops/server/services/n8n/plans"

/**
 * The managed n8n wizard: details, then the plan, then deploy.
 *
 * Two screens rather than a stepper, because there are only two decisions —
 * what to build, and whether to pay for it. Approval is the last thing that
 * happens on this page; everything before it is reversible.
 */

type Options = {
  plans: ServerPlan[]
  regions: string[]
  defaultRegion: string
  defaultTimezone: string
  costWarning: string
  subdomainAutomation: boolean
  subdomainNotice: string
  activeDeployments: number
}

type Form = {
  workspaceName: string
  adminEmail: string
  timezone: string
  region: string
  plan: string
  domainMode: "NONE" | "TISIOPS_SUBDOMAIN" | "CUSTOM"
  domain: string
}

const sectionTitle =
  "font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong"

/** A region code says nothing about where it is; the city does. */
const REGION_NAMES: Record<string, string> = {
  "ap-south-1": "Mumbai",
  "ap-southeast-1": "Singapore",
  "eu-west-1": "Ireland",
  "us-east-1": "N. Virginia",
}

/**
 * A short list rather than the full IANA database: the server validates the
 * Area/City shape, so free text turned a typo into a rejected deployment.
 */
const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
]

export function N8nWizard() {
  const router = useRouter()
  const [options, setOptions] = useState<Options | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [form, setForm] = useState<Form>({
    workspaceName: "",
    adminEmail: "",
    timezone: "Asia/Kolkata",
    region: "ap-south-1",
    plan: "STARTER",
    domainMode: "NONE",
    domain: "",
  })

  const [plan, setPlan] = useState<DeploymentPlan | null>(null)
  const [isPlanning, setIsPlanning] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    apiFetch<Options>("/api/deployments/n8n/options")
      .then((next) => {
        if (!active) return
        setOptions(next)
        setForm((current) => ({
          ...current,
          region: next.defaultRegion,
          timezone: next.defaultTimezone,
        }))
      })
      .catch((cause: Error) => active && setBlocked(cause.message))

    return () => {
      active = false
    }
  }, [])

  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  async function generatePlan() {
    setIsPlanning(true)
    setError(null)

    try {
      const result = await apiFetch<{ plan: DeploymentPlan }>(
        "/api/deployments/n8n/plan",
        { method: "POST", body: JSON.stringify(payload(form)) }
      )
      setPlan(result.plan)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setIsPlanning(false)
    }
  }

  async function deploy() {
    setIsDeploying(true)
    setError(null)

    try {
      const result = await apiFetch<{ id: string }>(
        "/api/deployments/n8n/deploy",
        { method: "POST", body: JSON.stringify(payload(form)) }
      )
      router.push(`/dashboard/deployments/${result.id}/progress`)
    } catch (cause) {
      setError((cause as Error).message)
      setIsDeploying(false)
    }
  }

  if (blocked) {
    return (
      <div className={card}>
        <h2 className={sectionTitle}>Managed n8n is not available</h2>
        <p className="mt-2 text-sm text-ink-muted">{blocked}</p>
      </div>
    )
  }

  if (!options) {
    return (
      <div className={`${card} flex items-center gap-2 text-sm text-ink-muted`}>
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        Loading options…
      </div>
    )
  }

  if (plan) {
    return (
      <PlanReview
        plan={plan}
        isDeploying={isDeploying}
        error={error}
        onBack={() => setPlan(null)}
        onDeploy={() => void deploy()}
      />
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void generatePlan()
      }}
    >
      <div className={card}>
        <div className="flex items-start gap-3">
          <SiN8n className="mt-0.5 size-6 shrink-0" color={SiN8nHex} />
          <div>
            <h2 className={sectionTitle}>
              Deploy n8n on TisiOps Managed Server
            </h2>
            <p className="mt-1.5 text-sm text-ink-muted">
              TisiOps will create and configure a managed server for n8n using
              TisiOps infrastructure. No AWS account is required from the user.
            </p>
          </div>
        </div>
      </div>

      <fieldset className={card}>
        <legend className={sectionTitle}>Hosting</legend>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[6px] border border-brand bg-brand-soft p-4">
            <div className="flex items-center gap-2">
              <ProviderIcon id="aws" />
              <span className="text-sm font-semibold text-ink-strong">
                TisiOps Managed Server
              </span>
              <Check className="ml-auto size-4 text-brand" aria-hidden />
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Runs on TisiOps infrastructure. Nothing to connect.
            </p>
          </div>

          <div className="rounded-[6px] border border-line bg-canvas p-4 opacity-60">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-ink-muted" aria-hidden />
              <span className="text-sm font-semibold text-ink-default">
                Use Your Own Server
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-muted">Coming soon</p>
          </div>
        </div>
      </fieldset>

      <fieldset className={card}>
        <legend className={sectionTitle}>Workspace</legend>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="workspaceName">
              Workspace name
            </label>
            <input
              id="workspaceName"
              className={inputClass}
              value={form.workspaceName}
              onChange={(event) => update("workspaceName", event.target.value)}
              placeholder="Ops Automation"
              maxLength={60}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="adminEmail">
              Admin email
            </label>
            <input
              id="adminEmail"
              type="email"
              className={inputClass}
              value={form.adminEmail}
              onChange={(event) => update("adminEmail", event.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          <div>
            <span className={labelClass}>Timezone</span>
            <Select
              label="Timezone"
              value={form.timezone}
              onValueChange={(timezone) => update("timezone", timezone)}
              options={TIMEZONES.map((zone) => ({
                value: zone,
                label: zone,
              }))}
            />
          </div>

          <div>
            <span className={labelClass}>Region</span>
            <Select
              label="Region"
              value={form.region}
              onValueChange={(region) => update("region", region)}
              options={options.regions.map((region) => ({
                value: region,
                label: region,
                hint: REGION_NAMES[region],
              }))}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className={card}>
        <legend className={sectionTitle}>Server plan</legend>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {options.plans.map((entry) => {
            const selected = form.plan === entry.key

            return (
              <label
                key={entry.key}
                className={`cursor-pointer rounded-[6px] border p-4 transition-colors duration-150 ease-out ${
                  selected
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-surface hover:bg-canvas"
                }`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={entry.key}
                  checked={selected}
                  onChange={() => update("plan", entry.key)}
                  className="sr-only"
                />
                <span className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-strong">
                    {entry.name}
                  </span>
                  {selected ? (
                    <Check className="size-4 text-brand" aria-hidden />
                  ) : null}
                </span>
                <span className="mt-2 block text-sm text-ink-default">
                  {entry.vcpu} · {entry.memory}
                </span>
                <span className="mt-1 block text-xs text-ink-muted">
                  {entry.bestFor}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className={card}>
        <legend className={sectionTitle}>Domain</legend>

        <div className="mt-4 flex flex-col gap-3">
          <DomainChoice
            checked={form.domainMode === "NONE"}
            onSelect={() => update("domainMode", "NONE")}
            title="No domain yet"
            detail="n8n answers on the server's Elastic IP over plain HTTP. Webhooks need HTTPS to be reliable."
          />

          <DomainChoice
            checked={form.domainMode === "TISIOPS_SUBDOMAIN"}
            onSelect={() => update("domainMode", "TISIOPS_SUBDOMAIN")}
            title="TisiOps subdomain"
            detail={
              options.subdomainAutomation
                ? "workspace-name.tisiops.app, created automatically."
                : options.subdomainNotice
            }
            disabled={!options.subdomainAutomation}
          />

          <DomainChoice
            checked={form.domainMode === "CUSTOM"}
            onSelect={() => update("domainMode", "CUSTOM")}
            title="Custom domain"
            detail="You point an A record at the Elastic IP once the server exists. Caddy then issues the certificate."
          />

          {form.domainMode === "CUSTOM" ? (
            <div>
              <label className={labelClass} htmlFor="domain">
                Domain
              </label>
              <input
                id="domain"
                className={inputClass}
                value={form.domain}
                onChange={(event) => update("domain", event.target.value)}
                placeholder="n8n.yourdomain.com"
                required
              />
            </div>
          ) : null}
        </div>
      </fieldset>

      {error ? (
        <p
          role="alert"
          className="rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] px-4 py-3 text-sm text-[#a8341f]"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPlanning} className={primaryButton}>
          {isPlanning ? (
            <>
              <Loader2
                className="mr-2 size-4 motion-safe:animate-spin"
                aria-hidden
              />
              Generating plan…
            </>
          ) : (
            "Generate deployment plan"
          )}
        </button>
        <p className="text-sm text-ink-muted">Nothing is created yet.</p>
      </div>
    </form>
  )
}

function DomainChoice({
  checked,
  onSelect,
  title,
  detail,
  disabled = false,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  detail: string
  disabled?: boolean
}) {
  return (
    <label
      className={`flex gap-3 rounded-[6px] border p-4 transition-colors duration-150 ease-out ${
        disabled
          ? "cursor-not-allowed border-line bg-canvas opacity-60"
          : checked
            ? "cursor-pointer border-brand bg-brand-soft"
            : "cursor-pointer border-line bg-surface hover:bg-canvas"
      }`}
    >
      <input
        type="radio"
        name="domainMode"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-1 size-4 accent-[#ff4400]"
      />
      <span>
        <span className="block text-sm font-semibold text-ink-strong">
          {title}
        </span>
        <span className="mt-1 block text-sm text-ink-muted">{detail}</span>
      </span>
    </label>
  )
}

function PlanReview({
  plan,
  isDeploying,
  error,
  onBack,
  onDeploy,
}: {
  plan: DeploymentPlan
  isDeploying: boolean
  error: string | null
  onBack: () => void
  onDeploy: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <h2 className={sectionTitle}>Deployment plan</h2>
        <p className="mt-2 text-sm text-ink-default">{plan.summary}</p>
        <p className="mt-3 text-xs text-ink-muted">
          {plan.aiGenerated
            ? "Summary written by TisiOps AI. The steps below come from the deployment itself, not the model."
            : "TisiOps AI was unavailable, so this is the standard summary. The steps below are unaffected."}{" "}
          Roughly {plan.estimatedMinutes} minutes.
        </p>
      </div>

      {plan.warnings.length > 0 ? (
        <div className="rounded-[6px] border border-line bg-brand-soft px-4 py-3">
          {plan.warnings.map((warning) => (
            <p
              key={warning}
              className="flex gap-2 text-sm text-ink-default not-first:mt-1.5"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-brand"
                aria-hidden
              />
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {plan.sections.map((section) => (
          <div key={section.title} className={card}>
            <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
              {section.title}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-ink-default">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line-warm"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] px-4 py-3 text-sm text-[#a8341f]"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onDeploy}
          disabled={isDeploying}
          className={primaryButton}
        >
          {isDeploying ? (
            <>
              <Loader2
                className="mr-2 size-4 motion-safe:animate-spin"
                aria-hidden
              />
              Creating deployment…
            </>
          ) : (
            "Deploy n8n"
          )}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={isDeploying}
          className={secondaryButton}
        >
          <ArrowLeft className="mr-1.5 size-4" aria-hidden />
          Change settings
        </button>
      </div>
    </div>
  )
}

function payload(form: Form) {
  return {
    ...form,
    domain: form.domainMode === "CUSTOM" ? form.domain : null,
  }
}
