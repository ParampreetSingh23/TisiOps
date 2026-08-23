"use client"

import Link from "next/link"

import { Reveal } from "@/components/landing/reveal"

export function FinalCta() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-20 sm:px-8 lg:px-14 lg:py-28">
        <Reveal className="mx-auto max-w-[760px] text-center">
          <h2 className="font-heading text-[clamp(2rem,3.5vw,3rem)] leading-[1.15] font-medium tracking-[-0.035em] text-balance text-ink-strong">
            Ready to stop deploying manually?
          </h2>
          <p className="mx-auto mt-4 max-w-[540px] text-base leading-relaxed text-ink-muted">
            Connect your repository. TisiOps inspects your framework, generates
            a safe infrastructure plan, and provisions your stack with full
            visibility.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="inline-flex h-[48px] items-center justify-center rounded-[6px] bg-brand px-6 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-hover active:bg-brand-active"
            >
              Get Started
            </Link>

            <Link
              href="/dashboard"
              className="inline-flex h-[48px] items-center justify-center rounded-[6px] border border-line-warm bg-surface px-6 text-sm font-medium text-ink-default shadow-card transition-colors duration-150 ease-out hover:bg-canvas"
            >
              Open Dashboard
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
