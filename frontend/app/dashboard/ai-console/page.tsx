import { currentUser } from "@clerk/nextjs/server"

import { AiConsole } from "@/components/dashboard/ai-console"
import { requireFeature } from "@/lib/feature-guard"

export default async function AiConsolePage() {
  await requireFeature("ai-console")

  const user = await currentUser()

  return <AiConsole firstName={user?.firstName ?? null} />
}
