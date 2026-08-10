import { Check } from "lucide-react"

import {
  Eyebrow,
  Section,
  SectionHeading,
  SectionLead,
} from "@/components/landing/section"

/**
 * The problem section.
 *
 * Its right-hand side is the page's signature: a real deployment plan, shown
 * as the product actually shows one. It ends on the approval gate rather than
 * on a success state, because "nothing runs until you say so" is the claim
 * that separates TisiOps from a script — and a mock that stopped at "deployed"
 * would be selling the wrong thing.
 */

const REASONS = [
  {
    title: "No manual SSH setup",
    body: "Avoid repeated server commands, port fixes, and reverse proxy setup.",
  },
  {
    title: "No confusing deployment configs",
    body: "TisiOps detects frameworks, root folders, build commands, and deployment targets.",
  },
  {
    title: "No silent failures",
    body: "Every deployment has logs, status, retry, and repair actions.",
  },
]

const PLAN = [
  { label: "GitHub repo selected", value: "acme/storefront" },
  { label: "Framework detected", value: "Next.js" },
  { label: "Root directory", value: "frontend" },
  { label: "Build command", value: "npm run build" },
  { label: "Target", value: "Vercel / AWS" },
]

export function WhyTisiOps() {
  return (
    <Section className="border-t border-line">
      <div className="grid items-start gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-20">
        <div>
          <Eyebrow>Why TisiOps</Eyebrow>

          <div className="mt-7">
            <SectionHeading>
              Deploy apps without fighting infrastructure
            </SectionHeading>
          </div>

          <SectionLead>
            TisiOps turns deployment tasks into guided AI workflows. Connect
            your repo, choose a target, review the plan, and let TisiOps handle
            the server, build, logs, and deployment steps.
          </SectionLead>

          <ul className="mt-10 flex flex-col gap-3">
            {REASONS.map((reason) => (
              <li
                key={reason.title}
                className="flex gap-3.5 rounded-[6px] border border-line bg-surface p-5 shadow-card"
              >
                <span
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft"
                  aria-hidden
                >
                  <Check className="size-3 text-brand" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-ink-strong">
                    {reason.title}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-muted">
                    {reason.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* The signature: an artefact of the product, not an illustration. */}
        <div className="w-full rounded-[8px] border border-line bg-surface shadow-float lg:justify-self-end">
          <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
            <span
              className="size-1.5 rounded-full bg-brand motion-safe:animate-pulse"
              aria-hidden
            />
            <span className="text-sm font-semibold text-ink-strong">
              AI Deployment Plan
            </span>
          </div>

          <ol className="flex flex-col px-5 py-2">
            {PLAN.map((step) => (
              <li
                key={step.label}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line/70 py-3.5 last:border-b-0"
              >
                <span
                  className="flex size-4 shrink-0 items-center justify-center rounded-full bg-brand"
                  aria-hidden
                >
                  <Check className="size-2.5 text-white" />
                </span>
                <span className="text-sm text-ink-default">{step.label}</span>
                <span className="ml-auto font-mono text-xs text-ink-muted">
                  {step.value}
                </span>
              </li>
            ))}
          </ol>

          {/* Deliberately the last and loudest line in the card. */}
          <div className="m-3 rounded-[6px] border border-brand/30 bg-brand-soft px-4 py-3.5">
            <p className="text-sm font-semibold text-brand">
              Approval required before deploy
            </p>
            <p className="mt-1 text-sm text-ink-default">
              Nothing is created until you approve this plan.
            </p>
          </div>
        </div>
      </div>
    </Section>
  )
}
