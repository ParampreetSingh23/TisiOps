import { DeploymentWizard } from "@/components/deployment/wizard"
import { requireFeature } from "@/lib/feature-guard"
import { getProviders } from "@/lib/provider-store"

export default async function CreateDeploymentPage() {
  await requireFeature("new-deployment")

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
        Create Deployment
      </h1>
      <p className="mt-2 mb-8 text-base text-ink-muted">
        TisiOps walks you through the setup, then shows the plan before anything
        runs.
      </p>

      <DeploymentWizard providers={getProviders()} />
    </div>
  )
}
