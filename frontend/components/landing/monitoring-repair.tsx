"use client"

import { ArrowRight, Check, X } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { Reveal } from "@/components/landing/reveal"

const CPU_SERIES = [34, 38, 31, 36, 34]
const MEMORY_SERIES = [61, 63, 62, 64, 61]

export function MonitoringRepair() {
  const prefersReduced = useReducedMotion()
  const [metricStep, setMetricStep] = useState(0)
  const [timelineStep, setTimelineStep] = useState(2)

  useEffect(() => {
    if (prefersReduced) return

    const metricInterval = setInterval(() => {
      setMetricStep((prev) => (prev + 1) % CPU_SERIES.length)
    }, 3000)

    const timelineInterval = setInterval(() => {
      setTimelineStep((prev) => (prev >= 2 ? 0 : prev + 1))
    }, 2800)

    return () => {
      clearInterval(metricInterval)
      clearInterval(timelineInterval)
    }
  }, [prefersReduced])

  const cpu = CPU_SERIES[metricStep]
  const memory = MEMORY_SERIES[metricStep]

  return (
    <section className="border-t border-line">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-20 sm:px-8 lg:px-14 lg:py-28">
        {/* Section Heading Area - Left Aligned */}
        <Reveal className="max-w-[760px]">
          <h2 className="font-heading text-[clamp(2rem,3.4vw,3rem)] leading-[1.15] font-medium tracking-[-0.035em] text-balance text-ink-strong">
            Monitor the server. Understand the failure.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">
            TisiOps turns live server signals, deployment events, and infrastructure state
            into clear diagnostics and repair plans.
          </p>
        </Reveal>

        {/* Unified Editorial Grid: 45% Left / 55% Right with Hairline Dividers */}
        <Reveal delay={0.15} className="mt-12 overflow-hidden rounded-[8px] border border-line bg-surface shadow-card">
          <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-12 lg:divide-y-0 lg:divide-x">
            
            {/* ========================================================================= */}
            {/* LEFT PANEL: Server Health (approx 45% width -> 5 of 12 cols on desktop)   */}
            {/* ========================================================================= */}
            <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-5">
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-line pb-4">
                  <div>
                    <h3 className="text-base font-semibold text-ink-strong">
                      ubuntu-prod-01
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      AWS · ap-south-1 · n8n-prod
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 pt-0.5 text-xs font-medium text-ink-default">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Online</span>
                  </div>
                </div>

                {/* Metadata Row */}
                <div className="grid grid-cols-3 gap-y-3 gap-x-2 text-xs border-b border-line pb-5">
                  <div>
                    <span className="text-ink-muted block text-[11px]">Provider</span>
                    <span className="font-medium text-ink-strong">AWS EC2</span>
                  </div>
                  <div>
                    <span className="text-ink-muted block text-[11px]">Instance</span>
                    <span className="font-mono text-ink-strong">t3.micro</span>
                  </div>
                  <div>
                    <span className="text-ink-muted block text-[11px]">Containers</span>
                    <span className="font-mono text-ink-strong">5 running</span>
                  </div>
                  <div>
                    <span className="text-ink-muted block text-[11px]">Uptime</span>
                    <span className="font-mono text-ink-strong">18d 4h</span>
                  </div>
                  <div>
                    <span className="text-ink-muted block text-[11px]">Runtime</span>
                    <span className="font-medium text-ink-strong">Docker 27.x</span>
                  </div>
                  <div>
                    <span className="text-ink-muted block text-[11px]">Public IP</span>
                    <span className="font-mono text-ink-strong">13.234.12.98</span>
                  </div>
                </div>

                {/* Metrics Horizontal Strip with Gentle Realtime Motion */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
                    Resource Utilization
                  </p>
                  <div className="grid grid-cols-3 divide-x divide-line rounded-[6px] border border-line bg-canvas py-3">
                    <div className="px-4">
                      <span className="text-[11px] font-medium text-ink-muted block uppercase">CPU</span>
                      <motion.span
                        key={cpu}
                        initial={{ opacity: 0.6 }}
                        animate={{ opacity: 1 }}
                        className="font-mono text-lg font-semibold text-ink-strong mt-0.5 block"
                      >
                        {cpu}%
                      </motion.span>
                      <div className="mt-2 h-1 w-full rounded-[2px] bg-line overflow-hidden">
                        <motion.div
                          animate={{ width: `${cpu}%` }}
                          transition={{ duration: 0.5 }}
                          className="h-full bg-ink-muted/60"
                        />
                      </div>
                    </div>

                    <div className="px-4">
                      <span className="text-[11px] font-medium text-ink-muted block uppercase">Memory</span>
                      <motion.span
                        key={memory}
                        initial={{ opacity: 0.6 }}
                        animate={{ opacity: 1 }}
                        className="font-mono text-lg font-semibold text-ink-strong mt-0.5 block"
                      >
                        {memory}%
                      </motion.span>
                      <div className="mt-2 h-1 w-full rounded-[2px] bg-line overflow-hidden">
                        <motion.div
                          animate={{ width: `${memory}%` }}
                          transition={{ duration: 0.5 }}
                          className="h-full bg-ink-muted/60"
                        />
                      </div>
                    </div>

                    <div className="px-4">
                      <span className="text-[11px] font-medium text-ink-muted block uppercase">Disk</span>
                      <span className="font-mono text-lg font-semibold text-ink-strong mt-0.5 block">48%</span>
                      <div className="mt-2 h-1 w-full rounded-[2px] bg-line overflow-hidden">
                        <div className="h-full bg-ink-muted/60" style={{ width: "48%" }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Signals List */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
                    Recent Signals
                  </p>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between border-b border-line/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-ink-muted">02:15</span>
                        <span className="text-ink-default">SSH handshake</span>
                      </div>
                      <span className="font-mono text-[11px] text-ink-muted">18 ms</span>
                    </div>

                    <div className="flex items-center justify-between border-b border-line/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-ink-muted">02:14</span>
                        <span className="text-ink-default">Docker daemon status</span>
                      </div>
                      <span className="font-mono text-[11px] text-ink-muted">5/5 healthy</span>
                    </div>

                    <div className="flex items-center justify-between pb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-ink-muted">02:10</span>
                        <span className="text-ink-default">HTTP health check</span>
                      </div>
                      <span className="font-mono text-[11px] font-medium text-ink-strong">200 OK</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Left Panel Footer */}
              <div className="mt-8 border-t border-line pt-4 font-mono text-[11px] text-ink-muted">
                <span>Monitoring active · Live telemetry stream</span>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* RIGHT PANEL: TisiOps Diagnosis (approx 55% width -> 7 of 12 cols)        */}
            {/* ========================================================================= */}
            <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-7 bg-canvas/40">
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-line pb-4">
                  <div>
                    <h3 className="text-base font-semibold text-ink-strong">
                      SSH Connectivity Timeout
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Target: Deployment <span className="font-mono">dep_01j8</span> (AWS EC2)
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 pt-0.5 text-xs font-semibold text-brand">
                    <span className="size-2 rounded-full bg-brand animate-pulse" />
                    <span>Issue detected</span>
                  </div>
                </div>

                {/* Timeline Flow */}
                <div className="border-b border-line pb-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
                    Execution Timeline
                  </p>
                  <div className="relative pl-6 space-y-4 text-xs">
                    {/* Vertical Connecting Line */}
                    <div className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-line-warm" />

                    {/* Step 1 */}
                    <div className="relative flex items-center justify-between">
                      <span className="absolute -left-6 flex size-3.5 items-center justify-center rounded-full bg-surface border border-line-warm text-ink-muted">
                        <Check className="size-2.5" />
                      </span>
                      <span className="text-ink-default font-medium">Provision infrastructure</span>
                      <span className="font-mono text-[11px] text-ink-muted">Completed</span>
                    </div>

                    {/* Step 2 */}
                    <div className="relative flex items-center justify-between">
                      <span className="absolute -left-6 flex size-3.5 items-center justify-center rounded-full bg-surface border border-line-warm text-ink-muted">
                        <Check className="size-2.5" />
                      </span>
                      <span className="text-ink-default font-medium">Attach Elastic IP</span>
                      <span className="font-mono text-[11px] text-ink-muted">Completed</span>
                    </div>

                    {/* Step 3 (Failed) */}
                    <motion.div
                      animate={{ opacity: timelineStep >= 2 ? 1 : 0.4 }}
                      className="relative flex items-center justify-between"
                    >
                      <span className="absolute -left-6 flex size-3.5 items-center justify-center rounded-full bg-brand text-white">
                        <X className="size-2.5" />
                      </span>
                      <span className="font-semibold text-brand">SSH bootstrap</span>
                      <span className="font-mono text-[11px] font-semibold text-brand">Failed (Timeout)</span>
                    </motion.div>
                  </div>
                </div>

                {/* Root Cause & Evidence */}
                <div className="border-b border-line pb-5 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Root Cause Analysis
                  </p>
                  <p className="text-xs leading-relaxed text-ink-default">
                    Port <span className="font-mono text-brand font-semibold">22</span> is not reachable from the TisiOps worker.
                    The EC2 instance is running and the Elastic IP is attached, so the failure is isolated to SSH connectivity.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                    <div className="rounded-[4px] border border-line bg-surface p-2">
                      <span className="text-ink-muted block text-[10px]">EC2 State</span>
                      <span className="font-semibold text-ink-strong">Running</span>
                    </div>
                    <div className="rounded-[4px] border border-line bg-surface p-2">
                      <span className="text-ink-muted block text-[10px]">Elastic IP</span>
                      <span className="font-semibold text-ink-strong">Attached</span>
                    </div>
                    <div className="rounded-[4px] border border-line bg-surface p-2">
                      <span className="text-ink-muted block text-[10px]">Port 22</span>
                      <span className="font-semibold text-brand">Unreachable</span>
                    </div>
                    <div className="rounded-[4px] border border-line bg-surface p-2">
                      <span className="text-ink-muted block text-[10px]">Retries</span>
                      <span className="font-semibold text-ink-strong">3 / 3</span>
                    </div>
                  </div>
                </div>

                {/* Recommended Action */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Recommended Action
                  </p>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Verify the AWS Security Group ingress rule for port <span className="font-mono text-ink-strong font-medium">22</span>, then retry the SSH bootstrap step.
                  </p>
                </div>
              </div>

              {/* Action Controls & Footer Detail */}
              <div className="mt-8 pt-4 border-t border-line flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Link
                    href="/sign-up"
                    className="inline-flex h-9 items-center justify-center rounded-[6px] bg-brand px-4 text-xs font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-hover active:bg-brand-active"
                  >
                    Review repair plan
                  </Link>

                  <Link
                    href="/docs"
                    className="text-xs font-medium text-ink-default hover:text-brand transition-colors inline-flex items-center gap-1 group"
                  >
                    <span>View logs</span>
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>

                <span className="font-mono text-[11px] text-ink-muted">
                  trace <span className="text-ink-strong">9f2a41d0</span> · worker-03
                </span>
              </div>
            </div>

          </div>
        </Reveal>
      </div>
    </section>
  )
}
