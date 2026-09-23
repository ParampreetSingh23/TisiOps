import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

export type SshDiagnosticInput = {
  host: string
  sshPort?: number
  sshUsername?: string
  authType: "key" | "password"
  privateKey?: string
  passphrase?: string
  password?: string
}

export type SshDiagnosticResult = {
  ok: boolean
  error?: string
  details?: {
    os?: string
    cpuInfo?: string
    memoryMb?: number
    diskGb?: number
    dockerStatus?: "INSTALLED" | "NOT_INSTALLED"
    sudoStatus?: "PASSWORDLESS" | "PASSWORD_REQUIRED" | "NONE"
    rawUser?: string
  }
}

/**
 * Runs diagnostic commands on remote server via SSH.
 * Strictly uses safe diagnostic commands:
 * whoami, uname -a, cat /etc/os-release, docker --version, df -h /, free -m, nproc, sudo -n true
 */
export async function testSshConnection(
  input: SshDiagnosticInput
): Promise<SshDiagnosticResult> {
  const host = input.host.trim()
  const port = input.sshPort ?? 22
  const username = (input.sshUsername ?? "ubuntu").trim()

  if (!host) {
    return { ok: false, error: "Host/IP address is required" }
  }

  if (input.authType === "key" && !input.privateKey?.trim()) {
    return { ok: false, error: "SSH private key is required" }
  }

  if (input.authType === "password" && !input.password) {
    return { ok: false, error: "SSH password is required" }
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "tisiops-ssh-test-"))
  const keyPath = path.join(tempDir, "id_rsa")

  try {
    const isKeyAuth = input.authType === "key"
    if (isKeyAuth && input.privateKey) {
      await writeFile(keyPath, input.privateKey.trim() + "\n", { mode: 0o600 })
    }

    const script = [
      "echo '---BEGIN_DIAG---'",
      "whoami",
      "uname -s -m",
      "if [ -f /etc/os-release ]; then . /etc/os-release; echo \"OS_DESC=$PRETTY_NAME\"; else echo \"OS_DESC=Linux\"; fi",
      "nproc",
      "free -m | awk '/Mem:/ {print $2}'",
      "df -BG / | awk 'NR==2 {print $2}' | tr -d 'G'",
      "if command -v docker >/dev/null 2>&1; then docker --version; else echo 'NO_DOCKER'; fi",
      "if sudo -n true >/dev/null 2>&1; then echo 'SUDO_OK'; else echo 'SUDO_NO'; fi",
      "echo '---END_DIAG---'",
    ].join("\n")

    const sshFlags = [
      "-p",
      String(port),
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

    let cmd = "ssh"
    let args: string[] = []

    if (isKeyAuth) {
      args = [...sshFlags, "-i", keyPath, `${username}@${host}`, "bash -s"]
    } else {
      // Password auth using sshpass if installed, or sshpass wrapper
      cmd = "sshpass"
      args = [
        "-p",
        input.password ?? "",
        "ssh",
        "-p",
        String(port),
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        "LogLevel=ERROR",
        "-o",
        "ConnectTimeout=10",
        `${username}@${host}`,
        "bash -s",
      ]
    }

    const res = await runProcess(cmd, args, script, 20_000)

    if (!res.ok) {
      const errLower = res.output.toLowerCase()
      if (errLower.includes("timed out") || errLower.includes("could not resolve") || errLower.includes("connection refused") || errLower.includes("route to host")) {
        return { ok: false, error: "Server unreachable. Check IP, SSH port, and cloud firewall/security groups." }
      }
      if (errLower.includes("permission denied") || errLower.includes("authentication failed")) {
        return {
          ok: false,
          error: "Authentication failed. Check SSH username and verify the key or password matches this server.",
        }
      }
      if (errLower.includes("sshpass: command not found") || errLower.includes("command not found")) {
        return { ok: false, error: "Password authentication is disabled or sshpass tool is missing on host. Please use SSH private key." }
      }
      return { ok: false, error: "SSH connection failed: " + sanitizeSshError(res.output) }
    }

    const diag = parseDiagOutput(res.output)
    return {
      ok: true,
      details: diag,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return { ok: false, error: sanitizeSshError(msg) }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

function runProcess(
  command: string,
  args: string[],
  inputScript: string,
  timeoutMs: number
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] })
    let output = ""

    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      resolve({ ok: false, output: "SSH timed out" })
    }, timeoutMs)

    child.stdout.on("data", (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      output += chunk.toString()
    })

    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ ok: false, output: err.message })
    })

    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, output })
    })

    child.stdin.write(inputScript)
    child.stdin.end()
  })
}

function parseDiagOutput(raw: string): SshDiagnosticResult["details"] {
  const lines = raw.split("\n").map((l) => l.trim())
  const start = lines.indexOf("---BEGIN_DIAG---")
  const end = lines.indexOf("---END_DIAG---")

  const diagLines = start !== -1 && end !== -1 && end > start ? lines.slice(start + 1, end) : lines

  const rawUser = diagLines[0] || "ubuntu"
  const uname = diagLines[1] || "Linux"
  const osDesc = diagLines[2] ? diagLines[2].replace("OS_DESC=", "") : "Ubuntu"
  const cpus = diagLines[3] ? `${diagLines[3]} vCPU` : "1 vCPU"
  const memMb = diagLines[4] ? parseInt(diagLines[4], 10) : undefined
  const diskGb = diagLines[5] ? parseInt(diagLines[5], 10) : undefined
  const dockerRaw = diagLines[6] || ""
  const sudoRaw = diagLines[7] || ""

  const dockerStatus = dockerRaw.includes("NO_DOCKER") || !dockerRaw.toLowerCase().includes("docker")
    ? "NOT_INSTALLED"
    : "INSTALLED"

  const sudoStatus = sudoRaw.includes("SUDO_OK") ? "PASSWORDLESS" : "NONE"

  return {
    rawUser,
    os: osDesc,
    cpuInfo: `${cpus} (${uname})`,
    memoryMb: isNaN(memMb!) ? undefined : memMb,
    diskGb: isNaN(diskGb!) ? undefined : diskGb,
    dockerStatus,
    sudoStatus,
  }
}

function sanitizeSshError(msg: string): string {
  if (msg.includes("timed out")) return "SSH connection timed out."
  if (msg.includes("Permission denied")) return "Authentication failed. Check credentials."
  if (msg.includes("Host key verification failed")) return "Host key verification failed."
  return "Could not connect to server via SSH."
}
