import { prisma } from "../../db/prisma"
import { withSpan } from "../observability/trace"
import { connectMonitoringSsh } from "./monitoring-ssh"
import { decryptStoredServerCredentials } from "./managed-server-credentials"
import { serverAddress } from "./server.service"
import type { ProductionRuntime } from "./production-runtime-parse"

/**
 * Actual staging setup execution (worker side).
 *
 * The Staging Agent ends at the structured plan; the worker runs it. For
 * EXISTING / SAME servers the target already has Docker, so this offers a real
 * read-write setup: clone the repo, check out the staging branch, and create
 * isolated staging network + volumes. NEW_SERVER (needs AWS provisioning first)
 * is deferred to the existing deployment infrastructure.
 */

export type StagingSetupResult =
  | { ok: true }
  | { ok: false; error: string }

type FinalPlan = {
  stagingBranch: string
  services: string[]
}

// ponytail: setup prepares infra but does not start the app — starting needs
// env values/secrets the user supplies. Add a compose/app step once secrets are
// wired.
export function stagingSetupScript(input: {
  repoUrl: string | null
  repoName: string
  branch: string
}): string {
  const { repoName, branch } = input
  const base = `/opt/tisiops/staging/${repoName}`
  return `
set -e
mkdir -p ${base}
cd ${base}
if [ ! -d .git ] && [ -n "${input.repoUrl}" ]; then
  git clone --quiet "${input.repoUrl}" .
fi
git fetch --quiet 2>/dev/null || true
git checkout ${branch} 2>/dev/null || git checkout -b ${branch}
docker network create ${repoName}-staging-net 2>/dev/null || true
docker volume create ${repoName}-staging-data 2>/dev/null || true
echo "STAGING_SETUP_OK"
`
}

/** Runs the staging setup over SSH on the target server. */
export async function runStagingSetup(input: {
  userId: string
  targetServerId: string
  stagingSessionId: string
}): Promise<StagingSetupResult> {
  return withSpan(
    "staging.setup.execute",
    { serverId: input.targetServerId, userId: input.userId, jobType: "PROVISION_STAGING", collectionStatus: "started" },
    async () => {
      const session = await prisma.stagingSession.findFirst({
        where: { id: input.stagingSessionId, userId: input.userId },
        include: { sourceServer: { include: { credentials: true } } },
      })
      if (!session) return { ok: false, error: "Staging session not found." }

      const target = await prisma.server.findFirst({
        where: { id: input.targetServerId, userId: input.userId },
        include: { credentials: true },
      })
      if (!target) return { ok: false, error: "Target server not found." }

      const plan = session.finalPlanJson as FinalPlan | null
      const runtime = session.runtimeJson as ProductionRuntime | null

      const repoName =
        (session.finalPlanJson as { repository?: string } | null)?.repository ??
        (runtime?.git.remote ?? "app").split("/").pop()?.replace(/\.git$/, "") ??
        "app"

      const resolved = decryptStoredServerCredentials(target.credentials)
      if (!resolved?.privateKey && !resolved?.password) {
        return { ok: false, error: "No usable SSH credentials for the target server." }
      }

      const ssh = await connectMonitoringSsh({
        host: serverAddress(target),
        sshPort: target.sshPort,
        sshUsername: target.sshUsername || "ubuntu",
        authType: resolved.authType,
        privateKey: resolved.privateKey,
        password: resolved.password,
        passphrase: resolved.passphrase,
        serverId: target.id,
      })
      if (!ssh.ok) return { ok: false, error: ssh.message }

      try {
        const script = stagingSetupScript({
          repoUrl: runtime?.git.remote ?? null,
          repoName,
          branch: plan?.stagingBranch ?? "staging",
        })
        const exec = await ssh.conn.exec(script, ssh.conn.sudo)
        if (!exec.ok) {
          return { ok: false, error: exec.stderr || exec.stdout || "Staging setup failed." }
        }
        if (!exec.stdout.includes("STAGING_SETUP_OK")) {
          return { ok: false, error: "Staging setup did not complete." }
        }
        return { ok: true }
      } catch {
        return { ok: false, error: "Staging setup failed." }
      } finally {
        ssh.conn.close()
      }
    }
  )
}
