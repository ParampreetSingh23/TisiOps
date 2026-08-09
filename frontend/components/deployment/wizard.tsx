"use client"

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  ShieldAlert,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

import { AwsConnect } from "@/components/deployment/aws-connect"
import {
  ANALYSIS,
  PLAN_STEPS,
  QUESTIONS,
  RECOMMENDED_CONFIG,
  REPOSITORIES,
  STEPS,
  VPS_FIELDS,
} from "@/components/deployment/data"
import { GithubConnect } from "@/components/deployment/github-connect"
import { ProviderIcon } from "@/components/deployment/provider-icon"
import type { Provider } from "@/lib/providers"
import { card, inputClass, primaryButton, secondaryButton } from "@/lib/ui"

function SectionHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="mb-6">
      <h2 className="font-heading text-xl font-medium tracking-[-0.02em] text-ink">
        {title}
      </h2>
      <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>
    </div>
  )
}

function DetailGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((row) => (
        <div key={row.label} className={card}>
          <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            {row.label}
          </p>
          <p className="mt-2 text-sm font-medium text-ink-strong">
            {row.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-8">
      <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase lg:hidden">
        Step {current + 1} of {STEPS.length} — {STEPS[current]}
      </p>

      <ol className="mt-3 hidden flex-wrap gap-x-6 gap-y-3 lg:flex">
        {STEPS.map((step, index) => {
          const isDone = index < current
          const isCurrent = index === current
          return (
            <li key={step} className="flex items-center gap-2">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isCurrent
                    ? "bg-brand text-white"
                    : isDone
                      ? "bg-brand-soft text-brand"
                      : "bg-canvas text-ink-muted"
                }`}
              >
                {isDone ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  index + 1
                )}
              </span>
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`text-sm ${
                  isCurrent ? "font-semibold text-ink-strong" : "text-ink-muted"
                }`}
              >
                {step}
              </span>
            </li>
          )
        })}
      </ol>

      <div
        className="mt-3 h-1 w-full overflow-hidden rounded-full bg-line lg:hidden"
        role="progressbar"
        aria-valuenow={current + 1}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
      >
        <div
          className="h-full bg-brand"
          style={{ width: `${((current + 1) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  )
}

export function DeploymentWizard({ providers }: { providers: Provider[] }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [provider, setProvider] = useState<string | null>(null)
  const [repo, setRepo] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [awsConnected, setAwsConnected] = useState(false)

  const selectedProvider = providers.find((item) => item.id === provider)
  const selectedRepo = REPOSITORIES.find((item) => item.name === repo)

  // Stable identity: AwsConnect reads this in an effect on mount.
  const handleAwsConnected = useCallback(
    (connected: boolean) => setAwsConnected(connected),
    []
  )

  // Steps that need an answer before moving on.
  const canContinue =
    (step === 0 && provider !== null) ||
    // AWS is wired up, so this step is a real gate: no saved connection, no Next.
    (step === 1 && (provider === "aws" ? awsConnected : true)) ||
    (step === 2 && repo !== null) ||
    (step === 4 && QUESTIONS.every((question) => answers[question.id])) ||
    ![0, 1, 2, 4].includes(step)

  function approveAndDeploy() {
    const id = Math.random().toString(36).slice(2, 10)
    router.push(`/dashboard/deployments/${id}`)
  }

  return (
    <div>
      <StepIndicator current={step} />

      {step === 0 ? (
        <section>
          <SectionHeader
            title="Choose a cloud provider"
            subtitle="Pick where TisiOps should deploy your application."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {providers.map((item) => {
              const isSelected = provider === item.id
              return (
                <article
                  key={item.id}
                  className={`${card} flex flex-col ${
                    isSelected ? "border-brand" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2.5 text-base font-semibold tracking-[-0.01em] text-ink-strong">
                      <ProviderIcon id={item.id} />
                      {item.name}
                    </h3>
                    <span
                      className={`rounded-[4px] px-2 py-0.5 text-xs font-semibold ${
                        item.available
                          ? "bg-brand-soft text-brand"
                          : "bg-canvas text-ink-muted"
                      }`}
                    >
                      {item.available ? "Available" : "Coming Soon"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {item.description}
                  </p>
                  <div className="mt-auto pt-5">
                    <button
                      type="button"
                      disabled={!item.available}
                      onClick={() => setProvider(item.id)}
                      className={`w-full ${isSelected ? primaryButton : secondaryButton}`}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section>
          <SectionHeader
            title={
              provider === "aws" ? "Connect AWS Account" : "Connect your server"
            }
            subtitle={
              provider === "aws"
                ? "Connect AWS so TisiOps can prepare deployment infrastructure after your approval."
                : "Give TisiOps the SSH details for the server you want to deploy to."
            }
          />

          {provider === "aws" ? (
            <AwsConnect
              onConnected={handleAwsConnected}
              onContinue={() => setStep(2)}
            />
          ) : (
            <div className={`${card} mx-auto max-w-2xl`}>
              <div className="grid gap-4 sm:grid-cols-2">
                {VPS_FIELDS.map((field) => (
                  <label key={field.name} className="block text-sm">
                    <span className="font-medium text-ink-strong">
                      {field.label}
                    </span>
                    <input
                      name={field.name}
                      type={field.type ?? "text"}
                      placeholder={field.placeholder}
                      autoComplete="off"
                      className={inputClass}
                    />
                  </label>
                ))}
              </div>

              <p className="mt-5 flex items-start gap-2.5 rounded-[6px] border border-line bg-canvas px-3.5 py-3 text-sm text-ink-default">
                <ShieldAlert
                  className="mt-0.5 size-4 shrink-0 text-brand"
                  aria-hidden
                />
                Use a dedicated deploy user with sudo access. Never share root
                credentials.
              </p>
              <p className="mt-3 text-xs text-ink-muted">
                Nothing is sent or stored — these fields are not wired up yet.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <SectionHeader
            title="Connect GitHub"
            subtitle="Connect your GitHub account so TisiOps can read repositories and analyze your application."
          />

          <GithubConnect repositoriesHref="#repositories" />

          <p id="repositories" className="mt-6 mb-3 text-sm text-ink-muted">
            The repositories below are examples. Reading your real repositories
            arrives with the deployment flow.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {REPOSITORIES.map((item) => {
              const isSelected = repo === item.name
              return (
                <article
                  key={item.name}
                  className={`${card} flex flex-col ${
                    isSelected ? "border-brand" : ""
                  }`}
                >
                  <h3 className="text-base font-semibold tracking-[-0.01em] text-ink-strong">
                    {item.name}
                  </h3>
                  <p className="mt-2 text-sm text-ink-muted">
                    {item.framework} · branch {item.branch}
                  </p>
                  <div className="mt-auto pt-5">
                    <button
                      type="button"
                      onClick={() => setRepo(item.name)}
                      className={`w-full ${isSelected ? primaryButton : secondaryButton}`}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <SectionHeader
            title="AI Repository Analysis"
            subtitle="TisiOps is analyzing your repository structure, framework, runtime, and deployment requirements."
          />
          <DetailGrid rows={ANALYSIS} />
          <p className="mt-6 rounded-[6px] border border-line bg-brand-soft px-4 py-3 text-sm font-medium text-brand">
            You can review and edit these settings before deployment.
          </p>
        </section>
      ) : null}

      {step === 4 ? (
        <section>
          <SectionHeader
            title="A few questions"
            subtitle="Your answers shape the server size, region, and runtime TisiOps recommends."
          />
          <div className="flex flex-col gap-4">
            {QUESTIONS.map((question) => (
              <fieldset key={question.id} className={card}>
                <legend className="text-sm font-semibold tracking-[-0.01em] text-ink-strong">
                  {question.question}
                </legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {question.options.map((option) => {
                    const isSelected = answers[question.id] === option
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          setAnswers((current) => ({
                            ...current,
                            [question.id]: option,
                          }))
                        }
                        className={`h-9 rounded-[6px] border px-3.5 text-sm font-medium transition-colors duration-150 ease-out ${
                          isSelected
                            ? "border-brand bg-brand-soft text-brand"
                            : "border-line-warm text-ink-default hover:bg-canvas"
                        }`}
                      >
                        {option}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section>
          <SectionHeader
            title="Recommended Deployment Config"
            subtitle="TisiOps recommends this setup based on your repository and requirements."
          />
          <DetailGrid rows={RECOMMENDED_CONFIG} />

          <div className={`${card} mt-6`}>
            <p className="text-sm leading-relaxed text-ink-default">
              This setup is recommended because your app is a Next.js
              application with low-to-medium expected traffic. A small
              Docker-based VPS is enough for the first version and can be scaled
              later.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setStep(6)}
                className={primaryButton}
              >
                Accept Recommendation
              </button>
              <button type="button" className={secondaryButton}>
                Edit Configuration
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {step === 6 ? (
        <section>
          <SectionHeader
            title="Review Deployment Plan"
            subtitle="Check the details, then approve the plan to continue."
          />

          <DetailGrid
            rows={[
              { label: "Provider", value: selectedProvider?.name ?? "AWS" },
              { label: "Region", value: "ap-south-1 Mumbai" },
              {
                label: "Repository",
                value: selectedRepo?.name ?? "portfolio-nextjs",
              },
              { label: "Branch", value: selectedRepo?.branch ?? "main" },
              {
                label: "Framework",
                value: selectedRepo?.framework ?? "Next.js",
              },
              { label: "Build Command", value: "npm run build" },
              { label: "Start Command", value: "npm start" },
              { label: "App Port", value: "3000" },
              { label: "Server", value: "2 vCPU / 2 GB RAM" },
            ]}
          />

          <div className={`${card} mt-6`}>
            <h3 className="text-base font-semibold tracking-[-0.01em] text-ink-strong">
              TisiOps Deployment Plan
            </h3>
            <ol className="mt-4 flex flex-col gap-2.5">
              {PLAN_STEPS.map((planStep, index) => (
                <li key={planStep} className="flex gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-[4px] bg-canvas text-xs font-semibold text-ink-muted">
                    {index + 1}
                  </span>
                  <span className="text-ink-default">{planStep}</span>
                </li>
              ))}
            </ol>
          </div>

          <p className="mt-6 flex items-start gap-2.5 rounded-[6px] border border-line bg-brand-soft px-4 py-3 text-sm font-medium text-brand">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            No infrastructure changes will happen until you approve this plan.
          </p>

          <button
            type="button"
            onClick={approveAndDeploy}
            className={`mt-6 h-12 px-6 text-base ${primaryButton}`}
          >
            Approve and Deploy
          </button>
        </section>
      ) : null}

      <div className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-6">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          className={secondaryButton}
        >
          <ChevronLeft className="mr-1.5 size-4" aria-hidden />
          Back
        </button>

        {step < 6 ? (
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => setStep((current) => current + 1)}
            className={primaryButton}
          >
            Next
            <ChevronRight className="ml-1.5 size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  )
}
