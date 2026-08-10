import { prisma } from "../../db/prisma"
import {
  startInstance,
  stopInstance,
  waitForState,
} from "../../services/aws/ec2"
import type { Handler } from "./types"

/**
 * Stop and start for a managed server.
 *
 * Deliberately not a destroy. The root volume and its data survive, the Elastic
 * IP stays attached, and starting again brings back the same server at the same
 * address — so a paused deployment can be resumed rather than rebuilt.
 *
 * The instance is stopped and started by id, read from the Server row this
 * deployment owns, so the blast radius is one machine.
 */

async function serverFor(deploymentId: string) {
  return prisma.server.findFirst({
    where: { deploymentId },
    orderBy: { createdAt: "desc" },
  })
}

export const serverStopHandler: Handler = async ({ deploymentId, log }) => {
  const server = await serverFor(deploymentId)

  if (!server?.awsInstanceId || !server.region) {
    return { ok: false, error: "This deployment has no server to stop." }
  }

  await log("Stopping the server")
  const result = await stopInstance(server.region, server.awsInstanceId)

  if (!result.ok) {
    await log(`Could not stop the server: ${result.error}`, "ERROR")
    return { ok: false, error: result.error }
  }

  await prisma.server.update({
    where: { id: server.id },
    data: { status: "STOPPING" },
  })

  // Reported only once AWS agrees, so the UI never claims a state the server
  // has not reached.
  const settled = await waitForState(
    server.region,
    server.awsInstanceId,
    "stopped"
  )

  await prisma.server.update({
    where: { id: server.id },
    data: { status: settled ? "STOPPED" : "STOPPING" },
  })

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      status: settled ? "STOPPED" : "STOPPING",
      statusDetail: settled
        ? "Server stopped. Its data and address are kept — start it again any time."
        : "AWS is still stopping the server.",
      // The address is not reachable while stopped, so it stops being offered.
      publicUrl: null,
    },
  })

  await log(
    settled ? "Server stopped" : "Server is still stopping",
    settled ? "SUCCESS" : "WARNING"
  )

  // The Elastic IP is billed while the instance is stopped — small, but not
  // zero, and a user who expects "paused" to mean "free" should be told.
  await log(
    "Compute charges stop while the server is stopped. The Elastic IP is still billed.",
    "INFO"
  )

  return { ok: true }
}

export const serverStartHandler: Handler = async ({ deploymentId, log }) => {
  const server = await serverFor(deploymentId)

  if (!server?.awsInstanceId || !server.region) {
    return { ok: false, error: "This deployment has no server to start." }
  }

  await log("Starting the server")
  const result = await startInstance(server.region, server.awsInstanceId)

  if (!result.ok) {
    await log(`Could not start the server: ${result.error}`, "ERROR")
    return { ok: false, error: result.error }
  }

  await prisma.server.update({
    where: { id: server.id },
    data: { status: "STARTING" },
  })

  const running = await waitForState(
    server.region,
    server.awsInstanceId,
    "running"
  )

  if (!running) {
    await log("The server did not reach a running state in time", "WARNING")
    return {
      ok: false,
      error: "The server did not start in time. Try again in a moment.",
    }
  }

  await prisma.server.update({
    where: { id: server.id },
    data: { status: "READY" },
  })

  await log("Server running", "SUCCESS")

  // Containers restart on their own — the compose services are `unless-stopped`
  // — but n8n takes a little while to answer, so this is not called live yet.
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { domain: true },
  })

  const url = deployment?.domain
    ? `https://${deployment.domain}`
    : `http://${server.elasticIp}`

  // Still STARTING, not HEALTH_CHECKING. A restart is not a deployment, and
  // HEALTH_CHECKING is a step in the deploy timeline — using it here made the
  // screen redraw "Creating AWS infrastructure" for a machine that has existed
  // for days. The Server row is READY by now, which is what moves the restart
  // timeline to its second stage.
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      status: "STARTING",
      statusDetail: "Server started. Waiting for n8n to answer.",
      publicUrl: url,
    },
  })

  await log("Waiting for the application to answer")

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${url}/healthz`, {
        signal: AbortSignal.timeout(8_000),
        redirect: "follow",
      })

      if (response.ok) {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: "LIVE", statusDetail: null },
        })
        await log("Health check passed", "SUCCESS")
        return { ok: true }
      }
    } catch {
      // Still booting; the loop is the wait.
    }

    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }

  await log("The application did not answer after the restart", "WARNING")

  return {
    ok: false,
    error:
      "The server started but the application did not answer. Retry, or check the deployment logs.",
  }
}
