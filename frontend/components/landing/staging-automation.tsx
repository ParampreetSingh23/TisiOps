"use client"

import {
  SiDocker,
  SiGithub,
  SiNodedotjs,
  SiPostgresql,
} from "@icons-pack/react-simple-icons"
import { ArrowRight, Globe, Layers } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { Reveal } from "@/components/landing/reveal"

export function StagingAutomation() {
  const prefersReduced = useReducedMotion()
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    if (prefersReduced) return

    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 4)
    }, 2500)

    return () => clearInterval(interval)
  }, [prefersReduced])

  return (
    <section className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-20 sm:px-8 lg:px-14 lg:py-28">
        <Reveal className="max-w-[760px]">
          <h2 className="font-heading text-[clamp(2rem,3.4vw,3rem)] leading-[1.15] font-medium tracking-[-0.035em] text-balance text-ink-strong">
            Turn production into staging without rebuilding manually
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">
            TisiOps inspects your production environment and mirrors it into an
            isolated staging deployment with automated branch targeting,
            database isolation, and health checks.
          </p>
        </Reveal>

        {/* Environment Mirroring Diagram Grid */}
        <Reveal delay={0.15} className="mt-12 grid items-stretch gap-4 lg:grid-cols-12">
          {/* Production Spec Box */}
          <div className="flex h-full flex-col justify-between rounded-[6px] border border-line bg-canvas p-6 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="font-mono text-xs font-semibold text-ink-strong">
                  Production Environment
                </span>
                <span className="rounded-[4px] border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-muted">
                  LIVE
                </span>
              </div>

              <div className="mt-4 space-y-3 font-mono text-xs text-ink-default">
                <div className="flex items-center gap-2.5">
                  <SiGithub className="size-3.5 text-ink-muted shrink-0" />
                  <span>Branch: <strong>main</strong></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <SiNodedotjs className="size-3.5 text-[#5FA04E] shrink-0" />
                  <span>Runtime: Node.js 22 + Docker</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <SiPostgresql className="size-3.5 text-[#4169E1] shrink-0" />
                  <span>Database: PostgreSQL 16 (Primary)</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Globe className="size-3.5 text-ink-muted shrink-0" />
                  <span>Endpoint: api.company.com</span>
                </div>
              </div>
            </div>

            <p className="mt-6 border-t border-line pt-3 font-mono text-[11px] text-ink-muted">
              Source of truth for infrastructure specs.
            </p>
          </div>

          {/* Center Bridge / Transformer */}
          <div className="flex h-full flex-col items-center justify-center rounded-[6px] border border-line bg-canvas p-5 text-center lg:col-span-2 relative overflow-hidden">
            <Layers className="size-5 text-ink-strong" />
            <span className="mt-2 font-mono text-xs font-bold text-ink-strong uppercase">
              TisiOps Mirror
            </span>
            <p className="mt-1 font-mono text-[10px] text-ink-muted leading-tight">
              Replicates topology & isolates resources
            </p>

            {/* Subtle animated beam line */}
            {!prefersReduced && (
              <motion.div
                animate={{ x: ["-100%", "100%"] }}
                transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand to-transparent opacity-60"
              />
            )}
          </div>

          {/* Staging Spec Box */}
          <div className="flex h-full flex-col justify-between rounded-[6px] border border-line bg-canvas p-6 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="font-mono text-xs font-semibold text-ink-strong">
                  Staging Environment
                </span>
                <span className="font-mono text-[11px] text-brand font-medium">
                  Isolated
                </span>
              </div>

              <div className="mt-4 space-y-3 font-mono text-xs text-ink-default">
                <div className="flex items-center gap-2.5">
                  <SiGithub className="size-3.5 text-brand shrink-0" />
                  <span>Branch: <strong className="text-brand">staging</strong></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <SiDocker className="size-3.5 text-[#2496ED] shrink-0" />
                  <span>Runtime: Node.js 22 + Docker (Mirrored)</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <SiPostgresql className="size-3.5 text-[#4169E1] shrink-0" />
                  <span>Database: Postgres (Ephemeral Clone)</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Globe className="size-3.5 text-ink-muted shrink-0" />
                  <span>Endpoint: staging-api.company.com</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-line pt-3">
              <span className="font-mono text-[11px] text-brand font-medium">
                1-click automated rollout
              </span>
              <Link
                href="/sign-up"
                className="font-mono text-xs font-semibold text-brand hover:underline inline-flex items-center gap-1 group"
              >
                <span>Create Staging</span>
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
