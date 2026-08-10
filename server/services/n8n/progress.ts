import type { Deployment, DeploymentStatus } from "../../db/generated/client"

/**
 * Turning a deployment status into the timeline the progress screen draws.
 *
 * Kept apart from index.ts so it stays pure: no database, no environment, and
 * therefore checkable on its own.
 */

/** The ordered steps the progress screen draws. */
export const N8N_STEPS: { status: DeploymentStatus; label: string }[] = [
  { status: "PLANNING", label: "AI planning deployment" },
  { status: "PENDING", label: "Deployment job created" },
  { status: "RUNNING", label: "Worker picked up the job" },
  { status: "PROVISIONING_INFRA", label: "Creating AWS infrastructure" },
  { status: "BOOTSTRAPPING_SERVER", label: "Installing Docker and n8n" },
  { status: "CONFIGURING_N8N", label: "Starting Postgres and n8n" },
  {
    status: "WAITING_FOR_DNS",
    label: "Waiting for DNS to point at the server",
  },
  { status: "CONFIGURING_SSL", label: "Configuring Caddy and SSL" },
  { status: "HEALTH_CHECKING", label: "Running health check" },
  { status: "LIVE", label: "n8n is live" },
]

export type ProgressStep = {
  label: string
  state: "done" | "current" | "pending" | "skipped"
}

/**
 * What the screen is actually showing.
 *
 * A deployment is not always mid-deploy, and treating every state as a step
 * list made a stopped server read as "Deploying n8n, 0%" with its start button
 * three cards below the fold.
 */
export type Phase = "deploying" | "starting" | "live" | "stopped" | "failed"

/**
 * The restart timeline.
 *
 * Separate from N8N_STEPS because restarting is not a short deployment: nothing
 * is created, nothing is installed, and showing "Creating AWS infrastructure"
 * for a machine that already exists would be false.
 */
export const N8N_START_STEPS = [
  "Starting the server",
  "Waiting for n8n to answer",
  "n8n is live",
]

export type N8nProgress = {
  phase: Phase
  status: DeploymentStatus
  statusDetail: string | null
  publicUrl: string | null
  domain: string | null
  elasticIp: string | null
  percent: number
  steps: ProgressStep[]
  failed: boolean
  canRetry: boolean
}

/**
 * Turns a status into a timeline.
 *
 * WAITING_FOR_DNS is skipped rather than pending when no custom domain was
 * chosen — showing a step that will never run reads as a stall.
 */
/** Paused states sit outside the deploy timeline entirely. */
const PAUSED = ["STOPPING", "STOPPED"]

function phaseOf(status: string): Phase {
  if (status === "LIVE") return "live"
  if (status === "STARTING") return "starting"
  if (PAUSED.includes(status)) return "stopped"
  if (status === "FAILED" || status === "CANCELLED") return "failed"
  return "deploying"
}

/**
 * The restart, as two stages.
 *
 * The only signal available is the Server row: the power handler marks it READY
 * once AWS reports the instance running, and everything after that is waiting
 * for n8n's own boot. The percentages are stage markers rather than a
 * measurement — the two stages take roughly as long as each other, and a
 * countdown of a fixed timeout would be a more precise lie.
 */
function startProgress(serverStatus: string | null): {
  steps: ProgressStep[]
  percent: number
} {
  const booted = serverStatus === "READY"
  const index = booted ? 1 : 0

  return {
    percent: booted ? 70 : 30,
    steps: N8N_START_STEPS.map((label, position) => ({
      label,
      state:
        position < index ? "done" : position === index ? "current" : "pending",
    })),
  }
}

export function buildProgress(
  deployment: Deployment,
  elasticIp: string | null,
  /** From the deployment's Server row. Only read while it is starting. */
  serverStatus: string | null = null
): N8nProgress {
  const phase = phaseOf(deployment.status)

  if (phase === "starting") {
    const { steps, percent } = startProgress(serverStatus)

    return {
      phase,
      status: deployment.status,
      statusDetail: deployment.statusDetail,
      publicUrl: deployment.publicUrl,
      domain: deployment.domain,
      elasticIp,
      percent,
      steps,
      failed: false,
      canRetry: false,
    }
  }

  const failed = deployment.status === "FAILED"
  const cancelled = deployment.status === "CANCELLED"
  const index = N8N_STEPS.findIndex((step) => step.status === deployment.status)
  const usesDns = Boolean(deployment.domain)

  const steps: ProgressStep[] = N8N_STEPS.map((step, position) => {
    if (step.status === "WAITING_FOR_DNS" && !usesDns) {
      return { label: step.label, state: "skipped" }
    }
    if (failed || cancelled) {
      return {
        label: step.label,
        state: position < index ? "done" : "pending",
      }
    }
    if (index === -1) return { label: step.label, state: "pending" }
    if (position < index) return { label: step.label, state: "done" }
    if (position === index) {
      return {
        label: step.label,
        state: deployment.status === "LIVE" ? "done" : "current",
      }
    }
    return { label: step.label, state: "pending" }
  })

  const done = steps.filter((step) => step.state === "done").length
  const countable = steps.filter((step) => step.state !== "skipped").length

  // A stopped server finished deploying long ago; showing 0% because STOPPED
  // is not a step in the list would misreport it as never having worked.
  const percent =
    phase === "stopped" || phase === "live"
      ? 100
      : countable === 0
        ? 0
        : Math.round((done / countable) * 100)

  return {
    phase,
    status: deployment.status,
    statusDetail: deployment.statusDetail,
    publicUrl: deployment.publicUrl,
    domain: deployment.domain,
    elasticIp,
    percent,
    steps,
    failed: failed || cancelled,
    canRetry: failed || cancelled,
  }
}
