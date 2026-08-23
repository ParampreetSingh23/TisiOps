import { AiGatewayPage } from "@/components/dashboard/ai-gateway"
import { requireFeature } from "@/lib/feature-guard"

export const metadata = { title: "AI Gateway" }

export default async function Page() {
  await requireFeature("ai-gateway")
  return <AiGatewayPage />
}
