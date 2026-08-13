import { connect } from "node:net"

/**
 * Does anything answer on this host and port?
 *
 * A TCP connect, not an SSH handshake: the question is only whether the machine
 * is up, and asking it without credentials keeps this usable from the servers
 * list, where it runs for any server caught mid-stop or mid-start.
 */
export function isPortOpen(
  host: string,
  port: number,
  timeoutMs = 3000
): Promise<boolean> {
  if (!host) return Promise.resolve(false)

  return new Promise((resolve) => {
    const socket = connect({ host, port })
    let settled = false

    const done = (open: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(open)
    }

    socket.setTimeout(timeoutMs)
    socket.once("connect", () => done(true))
    socket.once("timeout", () => done(false))
    socket.once("error", () => done(false))
  })
}
