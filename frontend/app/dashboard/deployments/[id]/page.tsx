import { DeploymentDetail } from "@/components/dashboard/deployment-detail"
import { requireFeature } from "@/lib/feature-guard"

export const metadata = { title: "Deployment" }

export default async function DeploymentStatusPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireFeature("deployments")
  const { id } = await params

  return <DeploymentDetail id={id} />
}
