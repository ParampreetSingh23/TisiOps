import { Client, type ConnectConfig } from "ssh2"

import { isPortOpen } from "./server-reachable"

/**
 * Shared SSH exec for the monitoring worker.
 *
 * One connection holds multiple exec calls and is closed by the caller. Keys,
 * passwords and passphrases stay in memory for the life of the connection and
 * are never logged — only host, port, username, auth kind, and timeout are.
 */

export type SshErrorCode =
  | "SSH_DNS_FAILED"
  | "SSH_CONNECTION_REFUSED"
  | "SSH_CONNECTION_TIMEOUT"
  | "SSH_HANDSHAKE_TIMEOUT"
  | "SSH_AUTH_FAILED"
  | "SSH_HOST_UNREACHABLE"
  | "SSH_CONNECTION_RESET"
  | "SSH_UNKNOWN_ERROR"
  | "SUDO_UNAVAILABLE"

export type SshExecResult = {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
}

export type MonitoringSshInput = {
  host: string
  sshPort: number
  sshUsername: string
  authType: "key" | "password"
  privateKey?: string
  password?: string
  passphrase?: string
  /** Only for diagnostics — never logged alongside credentials. */
  serverId?: string
  onLog?: (message: string) => void
}

export type MonitoringConn = {
  /** Whether commands run through `sudo -n` (non-root login user). */
  sudo: boolean
  exec: (script: string, sudo?: boolean) => Promise<SshExecResult>
  close: () => void
}

export type ConnectResult =
  | { ok: true; conn: MonitoringConn }
  | { ok: false; code: SshErrorCode; message: string }

/** Central timeout. A handshake that does not finish in this window is a real
 *  failure; the value is only raised for genuinely slow sshd, not to hide a
 *  network problem. */
const READY_TIMEOUT_MS = Number(process.env.SSH_READY_TIMEOUT_MS ?? 20_000)

const SAFE_MESSAGES: Record<SshErrorCode, string> = {
  SSH_DNS_FAILED: "The server's hostname could not be resolved.",
  SSH_CONNECTION_REFUSED: "The server refused the SSH connection.",
  SSH_CONNECTION_TIMEOUT: "Timed out connecting to the server over SSH.",
  SSH_HANDSHAKE_TIMEOUT: "Unable to establish an SSH connection with the server.",
  SSH_AUTH_FAILED: "SSH authentication failed. Check the stored credentials.",
  SSH_HOST_UNREACHABLE: "The server is unreachable from the worker.",
  SSH_CONNECTION_RESET: "The SSH connection was reset.",
  SSH_UNKNOWN_ERROR: "An unknown SSH error occurred.",
  SUDO_UNAVAILABLE: "Passwordless sudo is required.",
}

function classifyConnectError(err: Error): SshErrorCode {
  const e = err as Error & { code?: string; level?: string }
  const message = err.message.toLowerCase()

  if (e.level === "client-timeout" || message.includes("timed out while waiting for handshake")) {
    return "SSH_HANDSHAKE_TIMEOUT"
  }
  if (e.level === "client-authentication" || /authentication|permission denied|publickey|no supported authentication/i.test(message)) {
    return "SSH_AUTH_FAILED"
  }
  switch (e.code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "SSH_DNS_FAILED"
    case "ECONNREFUSED":
      return "SSH_CONNECTION_REFUSED"
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "SSH_HOST_UNREACHABLE"
    case "ECONNRESET":
      return "SSH_CONNECTION_RESET"
    case "ETIMEDOUT":
      return "SSH_CONNECTION_TIMEOUT"
    default:
      return /timed out/.test(message) ? "SSH_CONNECTION_TIMEOUT" : "SSH_UNKNOWN_ERROR"
  }
}

async function connectClient(config: ConnectConfig): Promise<Client> {
  return new Promise<Client>((resolve, reject) => {
    const client = new Client()
    client.once("ready", () => resolve(client))
    client.once("error", (err: Error) => reject(err))
    try {
      client.connect(config)
    } catch (err) {
      reject(err as Error)
    }
  })
}

function runScript(
  conn: Client,
  script: string,
  sudo: boolean
): Promise<SshExecResult> {
  return new Promise((resolve) => {
    conn.exec(sudo ? "sudo -n bash -s" : "bash -s", (error, stream) => {
      if (error) {
        resolve({ ok: false, code: null, stdout: "", stderr: error.message })
        return
      }

      let stdout = ""
      let stderr = ""
      stream.on("data", (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      stream.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      stream.on("close", (code: number | null) => {
        resolve({ ok: code === 0, code, stdout, stderr })
      })
      stream.end(script)
    })
  })
}

/** Opens one connection, probing `sudo -n` when the login user is not root. */
export async function connectMonitoringSsh(
  input: MonitoringSshInput
): Promise<ConnectResult> {
  const host = input.host.trim()
  const username = (input.sshUsername || "ubuntu").trim()
  const port = input.sshPort || 22
  const log = input.onLog ?? (() => {})
  const authLabel = input.privateKey ? "private-key" : "password"
  const serverLabel = input.serverId ?? "?"

  if (!input.privateKey && !input.password) {
    return { ok: false, code: "SSH_AUTH_FAILED", message: SAFE_MESSAGES.SSH_AUTH_FAILED }
  }

  const started = Date.now()
  log(
    `SSH connect start server=${serverLabel} host=${host} port=${port} user=${username} auth=${authLabel} timeout=${READY_TIMEOUT_MS}`
  )

  // TCP pre-check: separates "worker cannot reach the port" (network/firewall)
  // from "port answers but the SSH handshake stalls" (sshd/negotiation).
  const tcpOpen = await isPortOpen(host, port, 5000)
  if (!tcpOpen) {
    log(
      `SSH connect failed server=${serverLabel} host=${host} error=SSH_HOST_UNREACHABLE elapsed=${Date.now() - started}ms`
    )
    return { ok: false, code: "SSH_HOST_UNREACHABLE", message: SAFE_MESSAGES.SSH_HOST_UNREACHABLE }
  }

  const config: ConnectConfig = {
    host,
    port,
    username,
    readyTimeout: READY_TIMEOUT_MS,
    ...(input.privateKey
      ? { privateKey: input.privateKey, passphrase: input.passphrase }
      : { password: input.password }),
  }

  let client: Client
  try {
    client = await connectClient(config)
  } catch (err) {
    const code = classifyConnectError(err as Error)
    log(
      `SSH connect failed server=${serverLabel} host=${host} error=${code} elapsed=${Date.now() - started}ms`
    )
    return { ok: false, code, message: SAFE_MESSAGES[code] }
  }

  const sudo = username !== "root"
  if (sudo) {
    const probe = await runScript(client, "sudo -n true\n", false)
    if (!probe.ok) {
      client.end()
      return { ok: false, code: "SUDO_UNAVAILABLE", message: SAFE_MESSAGES.SUDO_UNAVAILABLE }
    }
  }

  let closed = false
  const conn: MonitoringConn = {
    sudo,
    exec: (script, s) => runScript(client, script, s ?? sudo),
    close: () => {
      if (!closed) {
        closed = true
        client.end()
      }
    },
  }

  return { ok: true, conn }
}
