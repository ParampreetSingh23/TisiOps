import { ServersView } from "@/components/dashboard/servers-view"
import { requireFeature } from "@/lib/feature-guard"

export const metadata = { title: "Servers" }

export default async function Page() {
  await requireFeature("servers")
  return <ServersView />
}
