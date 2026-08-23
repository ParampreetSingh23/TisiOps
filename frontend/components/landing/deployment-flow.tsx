"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check } from "lucide-react"
import { useEffect, useState } from "react"

import { Reveal } from "@/components/landing/reveal"

const WORKFLOW_STAGES = [
  {
    step: "01",
    name: "Repository",
    detail: "GitHub · staging",
  },
  {
    step: "02",
    name: "Plan",
    detail: "Next.js + Node.js",
  },
  {
    step: "03",
    name: "Approval",
    detail: "User approved",
  },
  {
    step: "04",
    name: "Execute",
    detail: "AWS EC2 worker",
  },
  {
    step: "05",
    name: "Verify",
    detail: "Live · HTTP 200",
  },
]

const PLAN_SPECS = [
  { label: "Repository", value: "parampreet/my-app", isMono: true },
  { label: "Branch", value: "staging", isMono: true },
  { label: "Detected stack", value: "Next.js 16 · Node.js", isMono: false },
  { label: "Target", value: "AWS EC2", isMono: false },
  { label: "Region", value: "ap-south-1 (Mumbai)", isMono: false },
  { label: "Runtime", value: "Docker 27.x", isMono: false },
  { label: "Status", value: "Live · Active", isMono: false, isAccent: true },
]

const EXECUTION_EVENTS = [
  { time: "12:00:01", label: "Repository inspected", meta: "staging branch", stage: 0 },
  { time: "12:00:03", label: "Framework detected", meta: "Next.js standalone", stage: 1 },
  { time: "12:00:05", label: "Deployment plan created", meta: "t3.micro · 20 GB", stage: 1 },
  { time: "12:00:12", label: "User approved plan", meta: "Admin authenticated", stage: 2 },
  { time: "12:00:13", label: "Worker job dispatched", meta: "Terraform + SSH", stage: 3 },
  { time: "12:00:45", label: "Health check passed", meta: "HTTP 200 OK", stage: 4 },
]

export function DeploymentFlow() {
  const prefersReduced = useReducedMotion()
  const [activeStage, setActiveStage] = useState(4)

  useEffect(() => {
    if (prefersReduced) return

    const interval = setInterval(() => {
      setActiveStage((prev) => (prev + 1) % 5)
    }, 2200)

    return () => clearInterval(interval)
  }, [prefersReduced])

  return (
    <section className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-20 sm:px-8 lg:px-14 lg:py-28">
        {/* Section Heading Area */}
        <Reveal className="max-w-[760px]">
          <h2 className="font-heading text-[clamp(2rem,3.4vw,3rem)] leading-[1.15] font-medium tracking-[-0.035em] text-balance text-ink-strong">
            From repository to running infrastructure
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">
            TisiOps inspects the repository, builds an infrastructure plan, waits
            for approval, then executes the deployment through controlled
            workers.
          </p>
        </Reveal>

        {/* Unified Editorial Workflow Canvas */}
        <Reveal delay={0.15} className="mt-12 overflow-hidden rounded-[8px] border border-line bg-canvas shadow-card">
          {/* Top: Horizontal Workflow Sequence */}
          <div className="border-b border-line bg-surface px-6 py-6 sm:px-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 lg:gap-6">
              {WORKFLOW_STAGES.map((stage, idx) => {
                const isCurrent = activeStage === idx
                const isPast = activeStage >= idx

                return (
                  <div key={stage.step} className="space-y-1 relative">
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-ink-muted">
                      <span className={isCurrent ? "text-brand" : isPast ? "text-ink-strong" : "text-ink-muted"}>
                        {stage.step}
                      </span>
                      <span className="text-line-warm">/</span>
                      <span className={isCurrent ? "text-brand font-bold" : isPast ? "text-ink-strong" : "text-ink-muted"}>
                        {stage.name}
                      </span>
                    </div>
                    <p
                      className={`text-xs transition-colors duration-200 ${
                        isCurrent
                          ? "font-semibold text-brand"
                          : isPast
                          ? "text-ink-default"
                          : "text-ink-muted"
                      }`}
                    >
                      {stage.detail}
                    </p>

                    {/* Subtle underline progress indicator */}
                    <div className="mt-2 h-0.5 w-full bg-line rounded-[1px] overflow-hidden">
                      {isPast && (
                        <motion.div
                          layoutId={prefersReduced ? undefined : "workflow-bar"}
                          className={`h-full ${isCurrent ? "bg-brand" : "bg-ink-muted/50"}`}
                          style={{ width: "100%" }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottom: 50/50 Split - Deployment Plan & Execution Activity */}
          <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-2 lg:divide-y-0 lg:divide-x">
            {/* Left: Deployment Plan */}
            <div className="flex flex-col justify-between p-6 sm:p-8">
              <div>
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <h3 className="font-heading text-base font-semibold text-ink-strong">
                    Deployment Plan
                  </h3>
                  <span className="font-mono text-[11px] text-ink-muted">
                    dep_01j8
                  </span>
                </div>

                {/* Structured Plan Definition List */}
                <div className="mt-6 divide-y divide-line border-y border-line text-xs">
                  {PLAN_SPECS.map((spec) => (
                    <div
                      key={spec.label}
                      className="flex items-center justify-between py-3"
                    >
                      <span className="text-ink-muted">{spec.label}</span>
                      <span
                        className={`${
                          spec.isMono ? "font-mono" : ""
                        } font-medium ${
                          spec.isAccent
                            ? "text-brand"
                            : "text-ink-strong"
                        }`}
                      >
                        {spec.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 border-t border-line pt-4 font-mono text-[11px] text-ink-muted">
                <span>Plan generated & verified · 12s execution window</span>
              </div>
            </div>

            {/* Right: Execution Activity */}
            <div className="flex flex-col justify-between p-6 sm:p-8 bg-surface/50">
              <div>
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <h3 className="font-heading text-base font-semibold text-ink-strong">
                    Execution Activity
                  </h3>
                  <span className="font-mono text-[11px] text-ink-muted">
                    {Math.min(activeStage + 1, 5)} / 5 steps
                  </span>
                </div>

                {/* Timeline Event List with Animated Step Reveal */}
                <div className="mt-6 space-y-3.5 text-xs">
                  {EXECUTION_EVENTS.map((event) => {
                    const isVisible = activeStage >= event.stage
                    const isCurrent = activeStage === event.stage

                    return (
                      <motion.div
                        key={event.time}
                        animate={{ opacity: isVisible ? 1 : 0.35 }}
                        transition={{ duration: 0.25 }}
                        className="flex items-center justify-between gap-3 border-b border-line/60 pb-2.5 last:border-b-0"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                              isCurrent
                                ? "border-brand bg-brand-soft text-brand"
                                : isVisible
                                ? "border-line bg-canvas text-ink-default"
                                : "border-line/40 bg-transparent text-ink-muted/40"
                            }`}
                          >
                            <Check className="size-2.5" />
                          </span>
                          <span className="font-mono text-[11px] text-ink-muted">
                            {event.time}
                          </span>
                          <span className={`truncate font-medium ${isCurrent ? "text-brand" : isVisible ? "text-ink-strong" : "text-ink-muted/60"}`}>
                            {event.label}
                          </span>
                        </div>

                        <span className="font-mono text-[11px] text-ink-muted shrink-0">
                          {event.meta}
                        </span>
                      </motion.div>
                    )
                  })}
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-line pt-4 text-xs">
                <span className="text-ink-muted font-medium">Live Endpoint:</span>
                <span className="font-mono font-semibold text-brand">
                  https://app.tisiops.net · 13.234.12.98
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
