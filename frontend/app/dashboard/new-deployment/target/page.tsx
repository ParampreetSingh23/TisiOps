import { DeploymentTargetPicker } from "@/components/deployment/deployment-target-picker"
import { requireFeature } from "@/lib/feature-guard"

export default async function DeploymentTargetPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  await requireFeature("new-deployment")
  const { template = "custom" } = await searchParams
  return <div className="mx-auto w-full max-w-4xl"><h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">Choose deployment target</h1><p className="mt-2 text-base text-ink-muted">Select where TisiOps should prepare this deployment before template configuration.</p><DeploymentTargetPicker template={template} /></div>
}
