import Link from "next/link"

import { BinaryPattern } from "@/components/landing/binary-pattern"
import { ChatDemoCard } from "@/components/landing/chat-demo-card"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <BinaryPattern />

      <div className="relative mx-auto grid w-full max-w-[1400px] items-center gap-14 px-5 pt-20 pb-24 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-20 lg:px-14 lg:pt-32 lg:pb-32">
        <div className="max-w-[640px]">
          <span className="inline-flex items-center rounded-[4px] border border-brand/30 bg-brand-soft px-3 py-1.5 text-sm font-semibold tracking-[-0.01em] text-brand">
            AI DevOps Engineer
          </span>

          <h1 className="mt-7 font-heading text-[clamp(2.5rem,5.2vw,4.25rem)] leading-[1.12] font-medium tracking-[-0.04em] text-balance text-ink">
            Deploy apps using natural language.
          </h1>

          <p className="mt-6 max-w-[560px] text-lg leading-relaxed text-ink-muted">
            TisiOps helps developers deploy, monitor, debug, and manage
            applications without manually configuring servers, Docker, Nginx,
            SSL, or CI/CD. Describe what you need in plain English and let your
            AI DevOps engineer handle the rest.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/sign-up"
              className="inline-flex h-[52px] items-center justify-center rounded-[6px] bg-brand px-6 text-base font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:bg-brand-active"
            >
              Get Started
            </Link>

            <Link
              href="#how-it-works"
              className="inline-flex h-[52px] items-center justify-center rounded-[6px] border border-line-warm bg-surface px-6 text-base font-medium text-ink-default shadow-card transition-colors duration-150 ease-out hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted"
            >
              See how it works
            </Link>
          </div>
        </div>

        <div
          id="how-it-works"
          className="w-full scroll-mt-24 lg:justify-self-end"
        >
          <ChatDemoCard />
        </div>
      </div>
    </section>
  )
}
