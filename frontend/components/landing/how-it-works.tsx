import Link from "next/link"

import {
  Section,
  SectionHeading,
  SectionLead,
} from "@/components/landing/section"

/**
 * The workflow.
 *
 * Numbered because the order is the product: a plan that ran before it was
 * reviewed would be a different, less safe thing. The numbers encode a real
 * sequence rather than decorating a list.
 */

const STEPS = [
  {
    title: "Connect",
    body: "Connect GitHub, select a repo, choose a branch, and pick the app folder.",
  },
  {
    title: "Analyze",
    body: "TisiOps AI detects the framework, runtime, build command, ports, env vars, and deployment target.",
  },
  {
    title: "Review",
    body: "You see the deployment plan, infrastructure changes, risk level, and expected result before anything runs.",
  },
  {
    title: "Deploy",
    body: "Workers run approved actions through queues, Terraform modules, and safe deployment scripts.",
  },
  {
    title: "Monitor",
    body: "Track live logs, status, final URL, failures, retries, and repair actions from the dashboard.",
  },
]

export function HowItWorks() {
  return (
    <Section id="how-it-works" className="border-t border-line">
      <div className="max-w-[720px]">
        <SectionHeading>
          From repository to live URL in one guided flow
        </SectionHeading>
        <SectionLead>
          TisiOps does not let AI directly run random infrastructure commands.
          Every deployment follows a safe plan, approval, worker, and logging
          process.
        </SectionLead>
      </div>

      <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col rounded-[8px] border border-line bg-surface p-5 shadow-card"
          >
            <span className="font-mono text-xs text-ink-muted tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-3 text-base font-semibold tracking-[-0.01em] text-ink-strong">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {step.body}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-col gap-6 rounded-[8px] border border-line bg-surface p-8 shadow-card sm:flex-row sm:items-center lg:p-10">
        <div className="min-w-0">
          <h3 className="font-heading text-xl font-medium tracking-[-0.02em] text-ink-strong">
            Built for safe AI deployment
          </h3>
          <p className="mt-2 max-w-[560px] text-base leading-relaxed text-ink-muted">
            AI plans. Backend validates. Workers execute. Logs explain every
            step.
          </p>
        </div>

        <Link
          href="/dashboard/new-deployment"
          className="inline-flex h-[52px] shrink-0 items-center justify-center rounded-[6px] bg-brand px-6 text-base font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:bg-brand-active sm:ml-auto"
        >
          Start a deployment
        </Link>
      </div>
    </Section>
  )
}
