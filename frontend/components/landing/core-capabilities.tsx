"use client"

import { SiDocker, SiVercel } from "@icons-pack/react-simple-icons"
import { ArrowRight, Check } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { ProviderIcon } from "@/components/deployment/provider-icon"
import { Reveal } from "@/components/landing/reveal"

const INITIAL_ROWS = [
  {
    id: "storefront-web",
    name: "storefront-web",
    source: "GitHub · main",
    target: "Vercel",
    icon: <SiVercel className="size-3.5 text-ink-strong" />,
    status: "Live",
    type: "live",
  },
  {
    id: "n8n-production",
    name: "n8n-production",
    source: "AWS · ap-south-1",
    target: "AWS EC2",
    icon: <ProviderIcon id="aws" className="h-3 w-5" />,
    status: "Provisioning",
    type: "provisioning",
  },
  {
    id: "api-staging",
    name: "api-staging",
    source: "Docker VPS · staging",
    target: "Custom VPS",
    icon: <SiDocker className="size-3.5 text-[#2496ED]" />,
    status: "Healthy",
    type: "live",
  },
]

const INFRASTRUCTURE_SPECS = [
  { label: "Compute", value: "AWS EC2 · t3.micro", isMono: true },
  { label: "Region", value: "ap-south-1 (Mumbai)", isMono: false },
  { label: "Storage", value: "20 GB · gp3 SSD", isMono: true },
  { label: "Public IP", value: "Dedicated Elastic IP", isMono: false },
  { label: "Runtime", value: "Docker 27.x", isMono: false },
  { label: "Ingress", value: "80, 443 (HTTP/S)", isMono: true },
  { label: "Approval", value: "Required before execution", isMono: false },
  { label: "Estimated cost", value: "₹480 / month", isMono: true },
]

export function CoreCapabilities() {
  const prefersReduced = useReducedMotion()
  const [rows, setRows] = useState(INITIAL_ROWS)

  useEffect(() => {
    if (prefersReduced) return

    const states = [
      { status: "Provisioning", type: "provisioning" },
      { status: "Health Checking", type: "provisioning" },
      { status: "Live", type: "live" },
    ]
    let stateIdx = 0

    const interval = setInterval(() => {
      stateIdx = (stateIdx + 1) % states.length
      setRows((prev) =>
        prev.map((row) =>
          row.id === "n8n-production"
            ? { ...row, ...states[stateIdx] }
            : row
        )
      )
    }, 3200)

    return () => clearInterval(interval)
  }, [prefersReduced])

  return (
    <section className="border-t border-line">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-20 sm:px-8 lg:px-14 lg:py-28">
        {/* Unified Editorial Canvas: 55% Left / 45% Right with Hairline Dividers */}
        <Reveal className="overflow-hidden rounded-[8px] border border-line bg-surface shadow-card">
          <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-12 lg:divide-y-0 lg:divide-x">
            
            {/* ========================================================================= */}
            {/* LEFT PANEL: Deployment Activity (approx 55% width -> 7 of 12 cols)        */}
            {/* ========================================================================= */}
            <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-7">
              <div>
                <h2 className="font-heading text-xl font-medium tracking-[-0.02em] text-ink-strong sm:text-2xl">
                  Deploy without rebuilding infrastructure
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
                  TisiOps turns a repository or existing server into an approved deployment workflow
                  without repeating manual infrastructure setup.
                </p>

                {/* Deployment Activity Table */}
                <div className="mt-8 divide-y divide-line border-y border-line">
                  {rows.map((row) => {
                    const isProvisioning = row.type === "provisioning"

                    return (
                      <div
                        key={row.id}
                        className="flex flex-col gap-2.5 py-4 first:pt-4 last:pb-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-line bg-canvas">
                              {row.icon}
                            </span>
                            <span className="font-medium text-ink-strong truncate text-sm">
                              {row.name}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {row.source} · <span className="text-ink-default">{row.target}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <motion.span
                            key={row.status}
                            initial={{ opacity: 0.6 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.2 }}
                            className={`inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5 font-mono text-[11px] font-medium ${
                              isProvisioning
                                ? "bg-brand-soft text-brand border border-brand/20"
                                : "bg-canvas text-ink-default border border-line"
                            }`}
                          >
                            {isProvisioning ? (
                              <span className="size-1.5 rounded-full bg-brand animate-pulse" />
                            ) : (
                              <Check className="size-2.5 text-emerald-600 dark:text-emerald-400" />
                            )}
                            {row.status}
                          </motion.span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Subtle Workflow Strip */}
                <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                  <span className="font-medium text-ink-strong">Workflow:</span>
                  <span>Repository</span>
                  <span>→</span>
                  <span>Plan</span>
                  <span>→</span>
                  <span className="font-semibold text-brand">Approval</span>
                  <span>→</span>
                  <span>Deploy</span>
                  <span>→</span>
                  <span>Health Check</span>
                </div>
              </div>

              {/* Left Panel System Status Footnote */}
              <div className="mt-8 border-t border-line pt-4 font-mono text-[11px] text-ink-muted">
                <span>3 active deployments · live telemetry</span>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* RIGHT PANEL: Infrastructure Plan (approx 45% width -> 5 of 12 cols)       */}
            {/* ========================================================================= */}
            <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-5 bg-canvas/30">
              <div>
                <h3 className="font-heading text-xl font-medium tracking-[-0.02em] text-ink-strong sm:text-2xl">
                  Know exactly what TisiOps will create
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  Review infrastructure, networking, runtime, and estimated cost before anything is executed.
                </p>

                {/* Technical Definition List */}
                <div className="mt-8 divide-y divide-line border-y border-line text-xs">
                  {INFRASTRUCTURE_SPECS.map((spec) => (
                    <div
                      key={spec.label}
                      className="flex items-center justify-between py-2.5"
                    >
                      <span className="text-ink-muted">{spec.label}</span>
                      <span
                        className={`text-ink-strong ${
                          spec.isMono ? "font-mono font-medium" : "font-medium"
                        } ${spec.label === "Estimated cost" ? "text-brand" : ""}`}
                      >
                        {spec.value}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-xs text-ink-muted">
                  No infrastructure changes are executed until approval.
                </p>
              </div>

              {/* Right Panel CTA */}
              <div className="mt-8 border-t border-line pt-4 flex items-center justify-between">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline group"
                >
                  <span>Review deployment plan</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>

                <span className="font-mono text-[11px] text-ink-muted">
                  AWS STS verified
                </span>
              </div>
            </div>

          </div>
        </Reveal>
      </div>
    </section>
  )
}
