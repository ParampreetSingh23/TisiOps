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
 * Credentials default to the worker's environment — the TisiOps account, the
 * same one Terraform uses. A bring-your-own server lives in the user's account
 * instead and is invisible to those keys, so every call here optionally takes
 * that user's credentials. They are never logged or returned.
 */

export type AwsCredentials = {
  accessKeyId: string
  secretAccessKey: string
}

function client(region: string, credentials?: AwsCredentials): EC2Client {
  return new EC2Client(credentials ? { region, credentials } : { region })
}

export type PowerResult =
  { ok: true; state: string } | { ok: false; error: string }

export type InstanceSnapshot = {
  state: string | null
  publicIp: string | null
  elasticIp: string | null
}

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
  instanceId: string,
  credentials?: AwsCredentials
): Promise<PowerResult> {
  try {
    const response = await client(region, credentials).send(
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
  instanceId: string,
  credentials?: AwsCredentials
): Promise<PowerResult> {
  try {
    const response = await client(region, credentials).send(
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
  instanceId: string,
  credentials?: AwsCredentials
): Promise<string | null> {
  return (await instanceSnapshot(region, instanceId, credentials))?.state ?? null
}

/** Current lifecycle state and public addresses, or null when AWS no longer knows it. */
export async function instanceSnapshot(
  region: string,
  instanceId: string,
  credentials?: AwsCredentials
): Promise<InstanceSnapshot | null> {
  try {
    const response = await client(region, credentials).send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] })
    )
    const instance = response.Reservations?.[0]?.Instances?.[0]

    return {
      state: instance?.State?.Name ?? null,
      publicIp: instance?.PublicIpAddress ?? null,
      elasticIp:
        instance?.NetworkInterfaces?.find((networkInterface) =>
          Boolean(networkInterface.Association?.PublicIp)
        )?.Association?.PublicIp ?? null,
    }
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

/**
 * The instance that answers on this address, or null.
 *
 * How a server connected over SSH gets a provider handle: the user gave
 * TisiOps an IP, and that is enough to find the instance behind it. An Elastic
 * IP stays associated while the instance is stopped, which is exactly the case
 * that needs this — a plain public IP is released on stop and will not be
 * found, and the caller says so rather than guessing.
 */
export async function findInstanceByPublicIp(
  region: string,
  ip: string,
  credentials?: AwsCredentials
): Promise<string | null> {
  if (!ip) return null

  try {
    const response = await client(region, credentials).send(
      new DescribeInstancesCommand({
        Filters: [
          {
            Name: "network-interface.addresses.association.public-ip",
            Values: [ip],
          },
        ],
      })
    )

    for (const reservation of response.Reservations ?? []) {
      for (const instance of reservation.Instances ?? []) {
        if (instance.InstanceId && instance.State?.Name !== "terminated") {
          return instance.InstanceId
        }
      }
    }

    return null
  } catch {
    return null
  }
}
