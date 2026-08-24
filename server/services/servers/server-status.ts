export type MappedServerStatus =
  | "STARTING"
  | "CONNECTED"
  | "STOPPING"
  | "STOPPED"
  | "TERMINATED"

/**
 * Whether this server's AWS calls go to the TisiOps account.
 *
 * Only servers TisiOps hosts itself. A server TisiOps provisioned *for* a user
 * lives in that user's account, so asking the platform account about its
 * instance id finds nothing — and a destroy that finds nothing leaves an
 * instance billing forever. The provider decides this, never the presence of a
 * deployment.
 */
export function usesPlatformAwsAccount(provider?: string | null): boolean {
  return provider === "TISIOPS_MANAGED_AWS"
}

/**
 * The address a server can be reached at.
 *
 * Elastic IP first, always: once an EIP is attached the auto-assigned publicIp
 * on the row goes stale, and reaching for it gives an address nothing answers
 * on. This lives in a leaf module because monitoring, the terminal, the repair
 * worker and the chat summaries all need it, and every inlined copy of the
 * expression is another chance to get the order wrong — which is how the stale
 * address reached the monitoring screen the first time.
 */
export function serverAddress(server: {
  elasticIp?: string | null
  publicIp?: string | null
  host?: string | null
}): string {
  return server.elasticIp || server.publicIp || server.host || ""
}

export function mapAwsInstanceState(state: string | null): MappedServerStatus | null {
  if (!state) return null

  switch (state) {
    case "pending":
      return "STARTING"
    case "running":
      return "CONNECTED"
    case "stopping":
      return "STOPPING"
    case "stopped":
      return "STOPPED"
    case "shutting-down":
      return "STOPPING"
    case "terminated":
      return "TERMINATED"
    default:
      return null
  }
}

/**
 * The same question for a server TisiOps only reaches over SSH.
 *
 * There is no provider API to ask whether a `shutdown -h now` finished, so the
 * machine's own SSH port is the signal: once nothing answers, it is off. Any
 * status that is not mid-transition is left alone — a probe is weaker evidence
 * than the status it would be overruling.
 */
export function reconcileSshServerStatus(
  current: string,
  reachable: boolean
): MappedServerStatus | null {
  if (current === "STOPPING") return reachable ? null : "STOPPED"
  if (current === "STARTING") return reachable ? "CONNECTED" : null
  return null
}

/**
 * What a failed SSH health check means, given where the server already was.
 *
 * A machine the user asked to stop is stopped, not unreachable: the two look
 * identical over SSH, but only one of them is a problem, and only one of them
 * should offer the user a "fix your connection" path.
 */
export type PowerInput = {
  status: string
  /** TisiOps holds a provider handle for this machine — an instance id and region. */
  hasProviderControl: boolean
  canUseSudoOverSsh: boolean
  /** An IP or hostname the instance can be looked up by if the handle is missing. */
  hasAddress: boolean
}

/**
 * Why the pause and restart buttons are unavailable, or null when they are not.
 *
 * The reason lives next to the decision on purpose. The server detail page used
 * to write its own explanation into a tooltip, and it was wrong in the case
 * that matters most: a stopped bring-your-own server was told it "must be
 * connected with stored SSH credentials", which it already was. The real answer
 * — TisiOps has no way to power it on — was nowhere on the screen.
 */
export function restartBlockedReason(input: PowerInput): string | null {
  if (input.status === "STOPPED") {
    if (input.hasProviderControl || input.hasAddress) return null
    return "TisiOps has no address for this server, so it cannot find the instance to start."
  }

  if (input.status !== "CONNECTED") {
    return "TisiOps must be connected to this server before it can restart it."
  }

  return input.canUseSudoOverSsh
    ? null
    : "Restarting over SSH needs stored credentials and passwordless sudo."
}

export function pauseBlockedReason(input: PowerInput): string | null {
  if (input.status === "STOPPED" || input.status === "STOPPING") {
    return "This server is already stopped."
  }

  if (input.hasProviderControl) return null

  if (input.status !== "CONNECTED") {
    return "TisiOps must be connected to this server before it can pause it."
  }

  return input.canUseSudoOverSsh
    ? null
    : "Pausing over SSH needs stored credentials and passwordless sudo."
}

export function statusAfterFailedSshCheck(
  current: string
): "STOPPED" | "UNREACHABLE" {
  return current === "STOPPING" || current === "STOPPED"
    ? "STOPPED"
    : "UNREACHABLE"
}
