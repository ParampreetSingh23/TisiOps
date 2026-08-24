import { AwsServerFlow } from "@/components/deployment/aws-server-flow"
import { requireFeature } from "@/lib/feature-guard"

export default async function AwsServerDeploymentPage() {
  await requireFeature("new-deployment")

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
        Deploy an AWS server
      </h1>
      <p className="mt-2 text-base text-ink-muted">
        Create a clean Ubuntu server on EC2 in your own AWS account, with a
        static Elastic IP and an SSH key TisiOps stores encrypted.
      </p>
      <AwsServerFlow />
    </div>
  )
}
