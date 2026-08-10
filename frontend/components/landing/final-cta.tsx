import Link from "next/link"

import { Section } from "@/components/landing/section"

/**
 * Closing call to action.
 *
 * Both links go through the dashboard route, which is protected — Clerk sends
 * a signed-out visitor to sign-in and a signed-in one straight through, so no
 * auth branching is needed here.
 */
export function FinalCta() {
  return (
    <Section className="border-t border-line bg-surface">
      <div className="mx-auto max-w-[720px] text-center">
        <h2 className="font-heading text-[clamp(1.875rem,3vw,2.5rem)] leading-[1.15] font-medium tracking-[-0.035em] text-balance text-ink">
          Ready to stop deploying manually?
        </h2>
        <p className="mx-auto mt-4 max-w-[520px] text-lg leading-relaxed text-ink-muted">
          Start with a repo. TisiOps will help you turn it into a deployment
          plan.
        </p>

        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="inline-flex h-[52px] items-center justify-center rounded-[6px] bg-brand px-6 text-base font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:bg-brand-active"
          >
            Get Started
          </Link>

          <Link
            href="/dashboard"
            className="inline-flex h-[52px] items-center justify-center rounded-[6px] border border-line-warm bg-surface px-6 text-base font-medium text-ink-default shadow-card transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted"
          >
            Open Dashboard
          </Link>
        </div>
      </div>
    </Section>
  )
}
