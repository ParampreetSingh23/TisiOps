import {
  DescribeInstancesCommand,
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
} from "@aws-sdk/client-ec2"

/**
 * EC2 power control for TisiOps-managed servers.
 *
 * Stopping is not destroying: the root volume, its data, and the Elastic IP all
 * survive, and starting again brings the same server back. That is the
 * difference the user cares about, and it is why this is a separate action
 * rather than a flavour of destroy.
 *
 * Credentials come from the worker's environment, the same ones Terraform uses.
 * They are never passed in, logged, or returned.
 */

function client(region: string): EC2Client {
  return new EC2Client({ region })
}

export type PowerResult =
  { ok: true; state: string } | { ok: false; error: string }

/**
 * Provider errors say too much and help too little, so they are classified
 * into something a user can act on — the same rule as Terraform failures.
 */
function describe(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)

  if (/InvalidInstanceID|NotFound/i.test(raw)) {
    return "That server no longer exists in AWS."
  }
  if (/UnauthorizedOperation|AccessDenied|not authorized/i.test(raw)) {
    return "The TisiOps AWS credentials are missing permission to do that."
  }
  if (/IncorrectInstanceState/i.test(raw)) {
    return "The server is still changing state. Try again in a moment."
  }
  if (/InvalidClientTokenId|AuthFailure|credential/i.test(raw)) {
    return "AWS rejected the TisiOps credentials."
  }

  return "AWS refused the request."
}

export async function stopInstance(
  region: string,
  instanceId: string
): Promise<PowerResult> {
  try {
    const response = await client(region).send(
      new StopInstancesCommand({ InstanceIds: [instanceId] })
    )

    return {
      ok: true,
      state: response.StoppingInstances?.[0]?.CurrentState?.Name ?? "stopping",
    }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

export async function startInstance(
  region: string,
  instanceId: string
): Promise<PowerResult> {
  try {
    const response = await client(region).send(
      new StartInstancesCommand({ InstanceIds: [instanceId] })
    )

    return {
      ok: true,
      state: response.StartingInstances?.[0]?.CurrentState?.Name ?? "pending",
    }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

/** Current lifecycle state, or null when AWS no longer knows the instance. */
export async function instanceState(
  region: string,
  instanceId: string
): Promise<string | null> {
  try {
    const response = await client(region).send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] })
    )

    return response.Reservations?.[0]?.Instances?.[0]?.State?.Name ?? null
  } catch {
    return null
  }
}

/**
 * Waits for the instance to settle.
 *
 * Stopping and starting both take a minute or so, and reporting "stopped"
 * before AWS agrees would leave the UI claiming something untrue.
 */
export async function waitForState(
  region: string,
  instanceId: string,
  target: "stopped" | "running",
  timeoutMs = 5 * 60_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if ((await instanceState(region, instanceId)) === target) return true
    await new Promise((resolve) => setTimeout(resolve, 6_000))
  }

  return false
}
