import { DeploymentStatus } from "@/components/dashboard/deployment-status"
import { requireFeature } from "@/lib/feature-guard"

export const metadata = { title: "Deployment" }

export default async function DeploymentStatusPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireFeature("deployments")
  const { id } = await params

  return <DeploymentStatus id={id} />
}
