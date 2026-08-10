/**
 * Shared contract for bootstrap services.
 *
 * Every template's bootstrap returns a script and nothing else. It never runs a
 * command, never opens a connection, and never takes a command from a caller —
 * which is what keeps "configure the server" from becoming a way to execute
 * arbitrary shell on it.
 */

export type BootstrapResult = {
  /** cloud-init script, passed to Terraform as sensitive user_data. */
  script: string
}

/**
 * Refuses anything that could break out of a single-quoted shell string or a
 * compose value.
 *
 * Inputs are validated upstream; this is the second line, because everything
 * these scripts contain runs as root on a fresh machine.
 */
export function assertTemplatable(label: string, value: string): string {
  if (/['"\\$`\n\r]/.test(value)) {
    throw new Error(`${label} contains characters that cannot be templated`)
  }

  return value
}
