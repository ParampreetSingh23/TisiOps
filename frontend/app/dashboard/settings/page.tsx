import { Placeholder } from "@/components/dashboard/placeholder"
import { requireFeature } from "@/lib/feature-guard"

export default async function Page() {
  await requireFeature("settings")

  return (
    <Placeholder
      title="Settings"
      description="Workspace and account preferences."
    />
  )
}
