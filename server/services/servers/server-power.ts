import { Client } from "ssh2"

type RebootInput = {
  host: string
  port: number
  username: string
  privateKey?: string
  password?: string
  passphrase?: string
}

export function rebootServerOverSsh(input: RebootInput): Promise<
  { ok: true } | { ok: false; error: string }
> {
  return runPowerCommand(input, "sudo -n reboot", "restart")
}

export function shutdownServerOverSsh(input: RebootInput): Promise<
  { ok: true } | { ok: false; error: string }
> {
  return runPowerCommand(input, "sudo -n shutdown -h now", "pause")
}

function runPowerCommand(
  input: RebootInput,
  command: string,
  action: "pause" | "restart"
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.host) return Promise.resolve({ ok: false, error: "Server host is missing." })
  if (!input.privateKey && !input.password) {
    return Promise.resolve({ ok: false, error: "SSH credentials are missing." })
  }

  return new Promise((resolve) => {
    const conn = new Client()
    let settled = false
    let opened = false
    let stderr = ""

    const done = (result: { ok: true } | { ok: false; error: string }) => {
      if (settled) return
      settled = true
      conn.end()
      resolve(result)
    }

    conn
      .on("ready", () => {
        conn.exec(command, (error, stream) => {
          if (error) {
            done({ ok: false, error: `Could not ${action} the server.` })
            return
          }

          opened = true
          stream.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString()
          })
          stream.on("close", (code: number | null) => {
            if (code === 0 || code === null) {
              done({ ok: true })
              return
            }

            done({
              ok: false,
              error: /password|sudo/i.test(stderr)
                ? `Passwordless sudo is required to ${action} this server.`
                : `Server ${action} command failed.`,
            })
          })
        })
      })
      .on("error", () => {
        done({ ok: false, error: "SSH connection failed." })
      })
      .on("close", () => {
        if (opened) done({ ok: true })
      })

    conn.connect({
      host: input.host,
      port: input.port,
      username: input.username,
      privateKey: input.privateKey,
      password: input.password,
      passphrase: input.passphrase,
      readyTimeout: 20_000,
    })
  })
}
