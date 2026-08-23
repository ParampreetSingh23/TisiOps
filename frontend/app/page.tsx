import type { Metadata } from "next"

import { CoreCapabilities } from "@/components/landing/core-capabilities"
import { DeploymentFlow } from "@/components/landing/deployment-flow"
import { FinalCta } from "@/components/landing/final-cta"
import { Footer } from "@/components/landing/footer"
import { Hero } from "@/components/landing/hero"
import { InfrastructureAiGateway } from "@/components/landing/infrastructure-ai-gateway"
import { MonitoringRepair } from "@/components/landing/monitoring-repair"
import { Navbar } from "@/components/landing/navbar"
import { SmoothScroll } from "@/components/providers/smooth-scroll"
import { StagingAutomation } from "@/components/landing/staging-automation"
import { Templates } from "@/components/landing/templates"

export const metadata: Metadata = {
  title: "TisiOps — AI DevOps Platform-as-a-Service",
  description:
    "TisiOps is an AI DevOps engineer that deploys, monitors, debugs, and manages your applications without manual server, Docker, Nginx, SSL, or CI/CD configuration.",
}

export default function Page() {
  return (
    <SmoothScroll>
      <div className="flex min-h-svh flex-col bg-canvas text-ink-default">
        <Navbar />
        <main className="flex-1">
          <Hero />
          <CoreCapabilities />
          <DeploymentFlow />
          <Templates />
          <InfrastructureAiGateway />
          <MonitoringRepair />
          <StagingAutomation />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </SmoothScroll>
  )
}
