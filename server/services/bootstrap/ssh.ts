import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

/**
 * SSH provisioning, using the system `ssh` and `ssh-keygen`.
 *
 * No SSH library. `ssh-keygen` produces a key in exactly the format OpenSSH and
 * AWS both expect, and `ssh` handles host keys, ciphers, and timeouts already —
 * a dependency here would be re-implementing two binaries that ship with every
 * host this worker runs on.
 *
 * Keys are per deployment, held encrypted in Postgres, and written to disk only
 * for the life of a single command.
 */

export type SshKeyPair = {
  /** OpenSSH public key line, passed to Terraform as `ssh_public_key`. */
  publicKey: string
  /** OpenSSH private key. Encrypted before it is stored, never logged. */
  privateKey: string
}

/** Runs a command, returning output rather than throwing. */
function run(
  command: string,
  args: string[],
  options: { input?: string; timeoutMs?: number } = {}
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      // A blocked prompt would otherwise hang the worker forever.
      stdio: ["pipe", "pipe", "pipe"],
    })

    let output = ""
    const collect = (chunk: Buffer) => {
      output += chunk.toString()
    }

    child.stdout.on("data", collect)
    child.stderr.on("data", collect)

    const timer = setTimeout(
      () => child.kill("SIGKILL"),
      options.timeoutMs ?? 15 * 60_000
    )

    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({
        ok: false,
        output: `${command} could not start: ${error.message}`,
      })
    })

    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, output })
    })

    if (options.input !== undefined) child.stdin.write(options.input)
    child.stdin.end()
  })
}

/**
 * Generates an ed25519 key pair.
 *
 * Shelled out rather than built with node:crypto: Node exports PKCS#8 PEM,
 * which OpenSSH will not read for ed25519, so a hand-rolled version would
 * produce a key that looks right and cannot be used.
 */
export async function generateSshKeyPair(): Promise<SshKeyPair> {
  const dir = await mkdtemp(path.join(tmpdir(), "tisiops-key-"))
  const keyPath = path.join(dir, "id_ed25519")

  try {
    const result = await run(
      "ssh-keygen",
      ["-t", "ed25519", "-N", "", "-C", "tisiops-provisioning", "-f", keyPath],
      { timeoutMs: 30_000 }
    )

    if (!result.ok) throw new Error("Could not generate a provisioning key.")

    const [privateKey, publicKey] = await Promise.all([
      readFile(keyPath, "utf8"),
      readFile(`${keyPath}.pub`, "utf8"),
    ])

    return { privateKey, publicKey: publicKey.trim() }
  } finally {
    // The private key must not outlive this function on disk.
    await rm(dir, { recursive: true, force: true })
  }
}

export type SshTarget = {
  host: string
  username: string
  privateKey: string
}

/** Common flags. Host keys are accepted on first sight: the instance is new. */
const SSH_FLAGS = [
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  "UserKnownHostsFile=/dev/null",
  "-o",
  "LogLevel=ERROR",
  "-o",
  "ConnectTimeout=10",
  "-o",
  "BatchMode=yes",
]

/**
 * Runs a script on the server.
 *
 * The key is written to a private temporary file for the duration of the call
 * and removed afterwards, and the script arrives on stdin rather than as an
 * argument so nothing sensitive appears in the process list.
 */
export async function runOverSsh(
  target: SshTarget,
  script: string,
  timeoutMs = 15 * 60_000,
  /**
   * Run as root. On by default because provisioning is what this is for:
   * installing packages, writing under /opt, and driving systemd all need it,
   * and the login user on an Ubuntu AMI is unprivileged. `-n` so a sudo that
   * unexpectedly wants a password fails immediately instead of hanging.
   */
  sudo = true
): Promise<{ ok: boolean; output: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "tisiops-ssh-"))
  const keyPath = path.join(dir, "key")

  try {
    await writeFile(keyPath, target.privateKey, { mode: 0o600 })

    return await run(
      "ssh",
      [
        ...SSH_FLAGS,
        "-i",
        keyPath,
        `${target.username}@${target.host}`,
        // The remote shell reads the script from stdin, so the commands never
        // become argv on either side.
        sudo ? "sudo -n bash -s" : "bash -s",
      ],
      { input: script, timeoutMs }
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Waits until the server accepts an SSH command.
 *
 * A fresh EC2 instance answers on port 22 before sshd is ready and before
 * cloud-init has finished, so this waits for a command to actually succeed
 * rather than for the port to open.
 */
export async function waitForSsh(
  target: SshTarget,
  options: {
    timeoutMs?: number
    onWait?: (attempt: number) => Promise<void>
  } = {}
): Promise<boolean> {
  const deadline = Date.now() + (options.timeoutMs ?? 5 * 60_000)
  let attempt = 0

  while (Date.now() < deadline) {
    attempt += 1
    // Deliberately unprivileged: this is testing whether sshd is up, and a
    // sudo problem here would look identical to an unreachable server.
    const result = await runOverSsh(target, "echo ready\n", 30_000, false)
    if (result.ok && result.output.includes("ready")) return true

    if (attempt === 1) await options.onWait?.(attempt)
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }

  return false
}

/**
 * This worker's public egress address.
 *
 * Used to scope the security group's SSH rule to just this machine. Returns
 * null when it cannot be determined, and the caller then decides — opening
 * port 22 to the world is a decision, not a fallback to make quietly.
 */
export async function workerPublicIp(): Promise<string | null> {
  try {
    const response = await fetch("https://checkip.amazonaws.com", {
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return null

    const ip = (await response.text()).trim()
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) ? ip : null
  } catch {
    return null
  }
}
