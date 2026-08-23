"use client"

import {
  SiDocker,
  SiN8n,
  SiNextdotjs,
  SiNginx,
  SiNodedotjs,
  SiPostgresql,
  SiPython,
  SiRedis,
  SiSupabase,
  SiUbuntu,
  SiVercel,
} from "@icons-pack/react-simple-icons"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { Reveal } from "@/components/landing/reveal"

const TEMPLATE_CARDS = [
  {
    name: "n8n Automation",
    category: "Workflow",
    provider: "AWS EC2",
    description: "Workflow automation runtime with persistent Postgres database and auto-configured SSL.",
    icon: <SiN8n className="size-4" color="#EA4B71" />,
  },
  {
    name: "PostgreSQL",
    category: "Database",
    provider: "AWS EC2",
    description: "Dedicated Postgres instance with encrypted credentials, volume persistence, and backups.",
    icon: <SiPostgresql className="size-4" color="#4169E1" />,
  },
  {
    name: "Redis Cache",
    category: "In-Memory",
    provider: "Docker",
    description: "High-performance key-value cache with memory limits and authentication.",
    icon: <SiRedis className="size-4" color="#DC382D" />,
  },
  {
    name: "Supabase Backend",
    category: "Full Backend",
    provider: "Docker",
    description: "Self-hosted Supabase with auth, storage, realtime engine, and Postgres database.",
    icon: <SiSupabase className="size-4" color="#3ECF8E" />,
  },
  {
    name: "Ubuntu Server",
    category: "Compute",
    provider: "BYOS / VPS",
    description: "Clean Ubuntu 24.04 server with SSH hardening, Docker engine, and health monitoring.",
    icon: <SiUbuntu className="size-4" color="#E95420" />,
  },
  {
    name: "Next.js App",
    category: "Frontend",
    provider: "Vercel",
    description: "Fullstack Next.js deployment with automated builds, preview URLs, and edge routing.",
    icon: <SiNextdotjs className="size-4 text-ink-strong" />,
  },
  {
    name: "Node.js API",
    category: "Backend",
    provider: "Docker / AWS",
    description: "Express or Fastify service with environment variables, reverse proxy, and logging.",
    icon: <SiNodedotjs className="size-4" color="#5FA04E" />,
  },
  {
    name: "Docker App",
    category: "Container",
    provider: "Custom VPS",
    description: "Deploy any containerized application with automated health checks and restart policies.",
    icon: <SiDocker className="size-4" color="#2496ED" />,
  },
  {
    name: "Nginx Proxy",
    category: "Networking",
    provider: "Linux",
    description: "Reverse proxy and load balancer with Let's Encrypt SSL certificate generation.",
    icon: <SiNginx className="size-4" color="#009639" />,
  },
  {
    name: "Python Service",
    category: "Backend",
    provider: "Docker",
    description: "FastAPI or Flask backend with virtual environment, dependencies, and Uvicorn runtime.",
    icon: <SiPython className="size-4" color="#3776AB" />,
  },
  {
    name: "Vercel Frontend",
    category: "Static / Edge",
    provider: "Vercel API",
    description: "React, Vite, Astro, or static applications deployed with instant worldwide CDN delivery.",
    icon: <SiVercel className="size-4 text-ink-strong" />,
  },
]

export function Templates() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-20 sm:px-8 lg:px-14 lg:py-28">
        <Reveal className="max-w-[760px]">
          <h2 className="font-heading text-[clamp(2rem,3.4vw,3rem)] leading-[1.15] font-medium tracking-[-0.035em] text-balance text-ink-strong">
            Deploy infrastructure templates in minutes
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">
            Start with production-ready services and let TisiOps handle
            provisioning, configuration, monitoring, and repair.
          </p>
        </Reveal>

        {/* 4-Column Compact Grid */}
        <Reveal delay={0.15} className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {TEMPLATE_CARDS.map((card) => (
            <div
              key={card.name}
              className="group flex flex-col justify-between rounded-[6px] border border-line bg-surface p-4 shadow-card transition-all duration-150 ease-out hover:border-line-warm hover:-translate-y-0.5"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-[4px] border border-line bg-canvas">
                    {card.icon}
                  </div>
                  <span className="font-mono text-[11px] text-ink-muted">
                    {card.provider}
                  </span>
                </div>

                <h3 className="mt-3 text-sm font-semibold tracking-[-0.01em] text-ink-strong group-hover:text-brand transition-colors">
                  {card.name}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted line-clamp-2">
                  {card.description}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-line pt-2.5">
                <span className="font-mono text-[10px] text-ink-muted">
                  {card.category}
                </span>

                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-brand hover:underline group/link"
                >
                  <span>Deploy</span>
                  <ArrowRight className="size-3 transition-transform group-hover/link:translate-x-0.5" />
                </Link>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
