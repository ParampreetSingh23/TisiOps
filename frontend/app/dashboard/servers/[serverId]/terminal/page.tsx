"use client"

import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Monitor,
  PlugZap,
  Server as ServerIcon,
  ShieldAlert,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { apiFetch } from "@/lib/api"
import { primaryButton, secondaryButton } from "@/lib/ui"
import {
  StatusDot,
  type ServerRecord,
} from "@/components/dashboard/servers-view"

type TerminalSessionResponse = {
  sessionId: string
  websocketUrl: string
}

type TerminalStatus = "Idle" | "Connecting" | "Connected" | "Disconnected"

export default function ServerTerminalPage() {
  const params = useParams()
  const serverId = params.serverId as string
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const [server, setServer] = useState<ServerRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOpening, setIsOpening] = useState(false)
  const [acceptedWarning, setAcceptedWarning] = useState(false)
  const [status, setStatus] = useState<TerminalStatus>("Idle")
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<TerminalSessionResponse | null>(null)

  const loadServer = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      setServer(await apiFetch<ServerRecord>(`/api/servers/${serverId}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Server not found")
    } finally {
      setIsLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    if (serverId) void loadServer()
  }, [serverId, loadServer])

  const openTerminal = async () => {
    setIsOpening(true)
    setError(null)
    try {
      const data = await apiFetch<TerminalSessionResponse>(
        `/api/servers/${serverId}/terminal/session`,
        { method: "POST" }
      )
      setAcceptedWarning(true)
      setSession(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open terminal")
    } finally {
      setIsOpening(false)
    }
  }

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    setStatus("Disconnected")
  }, [])

  useEffect(() => {
    if (!session?.websocketUrl || !terminalRef.current) return

    const websocketUrl = session.websocketUrl
    let disposed = false
    let cleanup = () => {}

    async function startTerminal() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ])
      if (disposed || !terminalRef.current) return

      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.35,
        theme: {
          background: "#050505",
          foreground: "#f5f3f2",
          cursor: "#ff5c22",
          selectionBackground: "#3a3634",
        },
      })
      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(terminalRef.current)
      fitAddon.fit()
      terminal.writeln("Connecting to SSH session...")

      const ws = new WebSocket(websocketUrl)
      wsRef.current = ws
      setStatus("Connecting")

      const sendSize = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            })
          )
        }
      }

      const input = terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }))
        }
      })
      const resize = terminal.onResize(sendSize)
      const observer = new ResizeObserver(() => {
        fitAddon.fit()
        sendSize()
      })
      observer.observe(terminalRef.current)

      ws.onopen = sendSize
      ws.onmessage = (event) => {
        const raw = typeof event.data === "string" ? event.data : ""
        try {
          const message = JSON.parse(raw) as {
            type?: string
            data?: string
            status?: string
            message?: string
          }
          if (message.type === "data" && message.data) terminal.write(message.data)
          if (message.type === "status") {
            setStatus(message.status === "CONNECTED" ? "Connected" : "Connecting")
          }
          if (message.type === "error") {
            setError(message.message || "Terminal connection failed")
            terminal.writeln("")
            terminal.writeln(message.message || "Terminal connection failed")
          }
        } catch {
          terminal.write(raw)
        }
      }
      ws.onclose = () => setStatus("Disconnected")
      ws.onerror = () => {
        setError("Terminal WebSocket connection failed.")
        setStatus("Disconnected")
      }

      cleanup = () => {
        input.dispose()
        resize.dispose()
        observer.disconnect()
        ws.close()
        terminal.dispose()
      }
    }

    void startTerminal()

    return () => {
      disposed = true
      cleanup()
    }
  }, [session])

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center">
        <Loader2 className="size-6 animate-spin text-brand" />
        <p className="mt-2 text-xs text-ink-muted">Loading server terminal...</p>
      </div>
    )
  }

  if (!server) {
    return (
      <div className="rounded-lg border border-line bg-surface p-8 text-center shadow-card">
        <AlertTriangle className="mx-auto size-8 text-amber-500" />
        <h1 className="mt-4 font-heading text-lg font-semibold text-ink-strong">
          Terminal unavailable
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{error || "Server not found."}</p>
        <Link href="/dashboard/servers" className={`mt-6 ${secondaryButton}`}>
          <ArrowLeft className="mr-2 size-4" />
          Back to Servers
        </Link>
      </div>
    )
  }

  const canOpen = server.status === "CONNECTED" && server.credentialsStored

  return (
    <div className="flex min-h-[calc(100svh-5rem)] flex-col gap-4">
      <Link
        href={`/dashboard/servers/${server.id}`}
        className="inline-flex w-fit items-center text-xs font-medium text-ink-muted hover:text-ink-strong"
      >
        <ArrowLeft className="mr-1.5 size-3.5" />
        Back to server
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink-strong">
              {server.name}
            </h1>
            <StatusDot status={server.status} />
          </div>
          <div className="mt-2 grid gap-2 text-xs text-ink-muted sm:grid-cols-3">
            <span className="inline-flex items-center gap-1.5 font-mono">
              <ServerIcon className="size-3.5" />
              {server.elasticIp || server.host || server.publicIp}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono">
              <Monitor className="size-3.5" />
              {server.sshUsername}:{server.sshPort}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <PlugZap className="size-3.5" />
              Status: {status}
            </span>
          </div>
        </div>

        <button
          onClick={disconnect}
          disabled={status !== "Connected" && status !== "Connecting"}
          className={secondaryButton}
        >
          Disconnect
        </button>
      </header>

      {error && (
        <div className="rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] p-3 text-xs font-medium text-[#a8341f] dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {!acceptedWarning ? (
        <section className="rounded-lg border border-line bg-surface p-5 shadow-card">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-brand" />
            <div>
              <h2 className="font-heading text-base font-semibold text-ink-strong">
                Live SSH terminal
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-default">
                You are opening a live SSH terminal. Commands you run here can change or damage the server. TisiOps will not run commands automatically.
              </p>
              {!canOpen && (
                <p className="mt-3 text-xs font-medium text-[#a8341f]">
                  Server must be connected with stored SSH credentials before terminal access is available.
                </p>
              )}
              <button
                onClick={openTerminal}
                disabled={!canOpen || isOpening}
                className={`mt-5 ${primaryButton}`}
              >
                {isOpening ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Opening terminal...
                  </>
                ) : (
                  "I understand, open terminal"
                )}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[#101010] bg-[#050505] shadow-card">
          <div
            ref={terminalRef}
            className="h-[min(72svh,760px)] min-h-[420px] w-full p-3"
          />
        </section>
      )}
    </div>
  )
}
