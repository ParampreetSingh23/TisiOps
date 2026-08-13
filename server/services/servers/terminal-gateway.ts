import type { Server as HttpServer, IncomingMessage } from "node:http"

import { Client, type ClientChannel } from "ssh2"
import { WebSocketServer, type RawData, type WebSocket } from "ws"

import {
  closeTerminalSession,
  consumeTerminalSession,
  markTerminalConnected,
  touchTerminalSession,
} from "./terminal.service"

type TerminalMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }

const PATH = /^\/ws\/terminal\/([^/]+)$/

function send(ws: WebSocket, message: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}

function dataToBuffer(raw: RawData): Buffer {
  if (Buffer.isBuffer(raw)) return raw
  if (Array.isArray(raw)) return Buffer.concat(raw)
  return Buffer.from(raw)
}

function parseMessage(raw: RawData): TerminalMessage | null {
  try {
    const message = JSON.parse(dataToBuffer(raw).toString()) as TerminalMessage
    if (message.type === "input" && typeof message.data === "string") return message
    if (
      message.type === "resize" &&
      Number.isInteger(message.cols) &&
      Number.isInteger(message.rows)
    ) {
      return message
    }
  } catch {
    return null
  }
  return null
}

export function attachTerminalGateway(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost")
    if (!PATH.test(url.pathname)) {
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req)
    })
  })

  wss.on("connection", (ws, req: IncomingMessage) => {
    void handleConnection(ws, req)
  })
}

async function handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const url = new URL(req.url ?? "", "http://localhost")
  const sessionId = PATH.exec(url.pathname)?.[1]
  const token = url.searchParams.get("token")

  if (!sessionId || !token) {
    send(ws, { type: "error", message: "Terminal session is invalid." })
    ws.close(1008)
    return
  }

  let session
  try {
    session = await consumeTerminalSession(sessionId, token)
  } catch {
    send(ws, { type: "error", message: "Terminal session could not start." })
    ws.close(1011)
    return
  }

  if (!session) {
    send(ws, { type: "error", message: "Terminal session expired or was denied." })
    ws.close(1008)
    return
  }

  const conn = new Client()
  let shell: ClientChannel | null = null
  let closed = false

  const closeAll = (status: "DISCONNECTED" | "FAILED" = "DISCONNECTED") => {
    if (closed) return
    closed = true
    shell?.end()
    conn.end()
    void closeTerminalSession(session.sessionId, status).catch(() => {})
    if (ws.readyState === ws.OPEN) ws.close()
  }

  ws.on("message", (raw) => {
    const message = parseMessage(raw)
    if (!message || !shell) return

    void touchTerminalSession(session.sessionId).catch(() => {})
    if (message.type === "input") shell.write(message.data)
    if (message.type === "resize") {
      shell.setWindow(message.rows, message.cols, 0, 0)
    }
  })

  ws.on("close", () => closeAll())
  ws.on("error", () => closeAll("FAILED"))

  conn
    .on("ready", () => {
      conn.shell(
        {
          term: "xterm-256color",
          cols: 80,
          rows: 24,
          width: 0,
          height: 0,
        },
        (error, stream) => {
          if (error) {
            send(ws, { type: "error", message: "Could not open SSH shell." })
            closeAll("FAILED")
            return
          }

          shell = stream
          void markTerminalConnected(session.sessionId).catch(() => {})
          send(ws, { type: "status", status: "CONNECTED" })

          stream.on("data", (data: Buffer) => {
            send(ws, { type: "data", data: data.toString("utf8") })
          })
          stream.stderr.on("data", (data: Buffer) => {
            send(ws, { type: "data", data: data.toString("utf8") })
          })
          stream.on("close", () => closeAll())
        }
      )
    })
    .on("error", () => {
      send(ws, { type: "error", message: "SSH connection failed." })
      closeAll("FAILED")
    })
    .on("close", () => closeAll())

  send(ws, { type: "status", status: "CONNECTING" })
  conn.connect({
    host: session.server.host,
    port: session.server.port,
    username: session.server.username,
    privateKey: session.server.privateKey,
    password: session.server.password,
    passphrase: session.server.passphrase,
    readyTimeout: 20_000,
  })
}
