"use client"

import {
  SiDocker,
  SiGithub,
  SiUbuntu,
  SiVercel,
} from "@icons-pack/react-simple-icons"
import { Bot, Network, Terminal, Wrench } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"

import {
  AnthropicLogo,
  DeepSeekLogo,
  GoogleGeminiLogo,
  MetaLlamaLogo,
  MistralLogo,
  OpenAiLogo,
} from "@/components/landing/brand-logos"
import { ProviderIcon } from "@/components/deployment/provider-icon"
import { Reveal } from "@/components/landing/reveal"

const PROVIDERS = [
  { name: "AWS EC2", type: "Compute & STS", icon: <ProviderIcon id="aws" className="h-3.5 w-6" /> },
  { name: "Custom VPS", type: "BYOS via SSH", icon: <SiUbuntu className="size-4 text-[#E95420]" /> },
  { name: "Vercel", type: "Serverless & Edge", icon: <SiVercel className="size-4 text-ink-strong" /> },
  { name: "Docker", type: "Containers", icon: <SiDocker className="size-4 text-[#2496ED]" /> },
  { name: "GitHub", type: "Repo Analysis", icon: <SiGithub className="size-4 text-ink-strong" /> },
]

const AI_MODELS = [
  { id: "openai", name: "OpenAI GPT-4o", icon: <OpenAiLogo className="size-3.5 text-emerald-600 dark:text-emerald-400" /> },
  { id: "gemini", name: "Google Gemini 2.5", icon: <GoogleGeminiLogo className="size-3.5 text-blue-500" /> },
  { id: "claude", name: "Claude 3.5 Sonnet", icon: <AnthropicLogo className="size-3.5 text-amber-600 dark:text-amber-400" /> },
  { id: "mistral", name: "Mistral Large", icon: <MistralLogo className="size-3.5 text-orange-500" /> },
  { id: "llama", name: "Meta Llama 3.3", icon: <MetaLlamaLogo className="size-3.5 text-indigo-500" /> },
  { id: "deepseek", name: "DeepSeek Coder", icon: <DeepSeekLogo className="size-3.5 text-cyan-500" /> },
]

const ROUTED_AGENTS = [
  { name: "AI Console", icon: Terminal },
  { name: "Repair Agent", icon: Wrench },
  { name: "GitHub Agent", icon: Bot },
]

export function InfrastructureAiGateway() {
  const prefersReduced = useReducedMotion()
  const [activeModelIdx, setActiveModelIdx] = useState(0)

  useEffect(() => {
    if (prefersReduced) return

    const interval = setInterval(() => {
      setActiveModelIdx((prev) => (prev + 1) % AI_MODELS.length)
    }, 2400)

    return () => clearInterval(interval)
  }, [prefersReduced])

  return (
    <section className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-20 sm:px-8 lg:px-14 lg:py-28">
        <div className="grid items-stretch gap-8 lg:grid-cols-2">
          {/* Left Column: Infrastructure across providers */}
          <Reveal className="flex h-full flex-col justify-between rounded-[8px] border border-line bg-canvas p-6 shadow-card sm:p-8">
            <div className="flex flex-col flex-1">
              <div>
                <h2 className="font-heading text-xl font-medium tracking-[-0.02em] text-ink-strong sm:text-2xl">
                  Infrastructure across providers
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  Connect your AWS account, import user-owned VPS instances over
                  SSH, or deploy frontends directly to Vercel — managed from one
                  central dashboard.
                </p>
              </div>

              {/* Provider Grid */}
              <div className="mt-8 space-y-2.5 flex-1 flex flex-col justify-center">
                {PROVIDERS.map((provider) => (
                  <div
                    key={provider.name}
                    className="flex items-center justify-between rounded-[6px] border border-line bg-surface px-4 py-3 text-xs hover:border-line-warm transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-[4px] border border-line bg-canvas">
                        {provider.icon}
                      </div>
                      <div>
                        <span className="font-semibold text-ink-strong">
                          {provider.name}
                        </span>
                        <p className="font-mono text-[11px] text-ink-muted">
                          {provider.type}
                        </p>
                      </div>
                    </div>

                    <span className="font-mono text-[11px] text-ink-muted">
                      Connected
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-line pt-4 text-xs font-mono text-ink-muted">
              <span>Control plane encrypted at rest</span>
              <span className="text-brand font-semibold">AES-256-GCM</span>
            </div>
          </Reveal>

          {/* Right Column: AI Gateway */}
          <Reveal delay={0.15} className="flex h-full flex-col justify-between rounded-[8px] border border-line bg-canvas p-6 shadow-card sm:p-8">
            <div className="flex flex-col flex-1">
              <div>
                <h3 className="font-heading text-xl font-medium tracking-[-0.02em] text-ink-strong sm:text-2xl">
                  One gateway for your AI models
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  Proxy LLM requests with built-in per-user rate limiting, token
                  audit logging, API key management, and intelligent agent
                  routing.
                </p>
              </div>

              {/* AI Routing Diagram Box */}
              <div className="mt-8 space-y-4 rounded-[6px] border border-line bg-surface p-5 flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div className="flex items-center gap-2">
                    <Network className="size-4 text-brand" />
                    <span className="font-mono text-xs font-semibold text-ink-strong">
                      TisiOps AI Gateway
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-ink-muted">
                    Proxy active
                  </span>
                </div>

                {/* Model Grid with Real Brand Logos and Cycling Active State */}
                <div className="space-y-2">
                  <p className="font-mono text-[11px] font-semibold text-ink-muted uppercase">
                    Integrated Models & Providers
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {AI_MODELS.map((model, idx) => {
                      const isActive = activeModelIdx === idx

                      return (
                        <div
                          key={model.id}
                          className={`rounded-[4px] border p-2.5 flex items-center gap-2 transition-all duration-200 ${
                            isActive
                              ? "border-brand/40 bg-brand-soft shadow-xs"
                              : "border-line bg-canvas"
                          }`}
                        >
                          <div className="flex size-5 shrink-0 items-center justify-center">
                            {model.icon}
                          </div>
                          <div className="min-w-0">
                            <span className={`font-mono text-[11px] font-semibold block truncate ${isActive ? "text-brand" : "text-ink-strong"}`}>
                              {model.name}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Dispatched Agents */}
                <div className="space-y-2 border-t border-line pt-3">
                  <p className="font-mono text-[11px] font-semibold text-ink-muted uppercase">
                    Dispatched Agents
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ROUTED_AGENTS.map((agent) => (
                      <div
                        key={agent.name}
                        className="flex items-center gap-1.5 rounded-[4px] border border-line bg-canvas px-2.5 py-1 text-xs"
                      >
                        <agent.icon className="size-3 text-brand" />
                        <span className="font-mono text-[11px] text-ink-strong">
                          {agent.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-line pt-4 text-xs font-mono text-ink-muted">
              <span>Audit logs & rate limits</span>
              <span className="text-ink-strong font-medium">Automatic Fallback</span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
