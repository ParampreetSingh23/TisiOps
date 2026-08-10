"use client"

import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Cpu,
  HardDrive,
  Key,
  Loader2,
  Lock,
  Server as ServerIcon,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react"
import { useState } from "react"

import { apiFetch } from "@/lib/api"
import { card, inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui"

export type ProviderOption = {
  id: string
  name: string
  icon?: string
}

const PROVIDERS: ProviderOption[] = [
  { id: "AWS", name: "AWS EC2" },
  { id: "GCP", name: "Google Cloud VM" },
  { id: "AZURE", name: "Azure VM" },
  { id: "DIGITALOCEAN", name: "DigitalOcean" },
  { id: "HETZNER", name: "Hetzner" },
  { id: "VULTR", name: "Vultr" },
  { id: "LINODE", name: "Linode / Akamai" },
  { id: "EXCLOUD", name: "Excloud" },
  { id: "CONTABO", name: "Contabo" },
  { id: "OTHER_VPS", name: "Other VPS" },
]

export function ConnectServerModal({
  isOpen,
  onClose,
  onServerCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onServerCreated: () => void
}) {
  const [mode, setMode] = useState<"SELECT_MODE" | "BYOS">("SELECT_MODE")
  const [comingSoonAlert, setComingSoonAlert] = useState(false)

  // BYOS Wizard State
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [provider, setProvider] = useState<string>("AWS")
  const [serverName, setServerName] = useState<string>("")
  const [host, setHost] = useState<string>("")
  const [sshPort, setSshPort] = useState<number>(22)
  const [osType, setOsType] = useState<string>("Ubuntu")
  const [sshUsername, setSshUsername] = useState<string>("ubuntu")
  const [authType, setAuthType] = useState<"key" | "password">("key")
  const [privateKey, setPrivateKey] = useState<string>("")
  const [passphrase, setPassphrase] = useState<string>("")
  const [password, setPassword] = useState<string>("")

  // Test Connection State
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    error?: string
    details?: {
      os?: string
      cpuInfo?: string
      memoryMb?: number
      diskGb?: number
      dockerStatus?: "INSTALLED" | "NOT_INSTALLED"
      sudoStatus?: "PASSWORDLESS" | "PASSWORD_REQUIRED" | "NONE"
    }
  } | null>(null)

  // Final submit state
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleClose = () => {
    setMode("SELECT_MODE")
    setStep(1)
    setTestResult(null)
    setComingSoonAlert(false)
    onClose()
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)

    try {
      const data = await apiFetch<{
        os?: string
        cpuInfo?: string
        memoryMb?: number
        diskGb?: number
        dockerStatus?: "INSTALLED" | "NOT_INSTALLED"
        sudoStatus?: "PASSWORDLESS" | "PASSWORD_REQUIRED" | "NONE"
      }>("/api/servers/test-connection", {
        method: "POST",
        body: JSON.stringify({
          provider,
          host,
          sshPort,
          sshUsername,
          authType,
          privateKey: authType === "key" ? privateKey : undefined,
          passphrase: passphrase || undefined,
          password: authType === "password" ? password : undefined,
        }),
      })

      setTestResult({
        ok: true,
        details: data,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Connection failed"
      setTestResult({
        ok: false,
        error: errorMsg,
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleConnectServer = async () => {
    setIsSubmitting(true)
    try {
      const generatedName =
        serverName.trim() || `ubuntu-server-${Math.random().toString(36).substring(2, 7)}`

      await apiFetch("/api/servers", {
        method: "POST",
        body: JSON.stringify({
          name: generatedName,
          provider,
          host,
          sshPort,
          sshUsername,
          osType,
          osVersion: testResult?.details?.os || "Ubuntu 22.04 LTS",
          dockerStatus: testResult?.details?.dockerStatus || "NOT_INSTALLED",
          sudoStatus: testResult?.details?.sudoStatus || "PASSWORDLESS",
          cpuInfo: testResult?.details?.cpuInfo || null,
          memoryMb: testResult?.details?.memoryMb || null,
          diskGb: testResult?.details?.diskGb || null,
          authType,
          privateKey: authType === "key" ? privateKey : undefined,
          passphrase: passphrase || undefined,
          password: authType === "password" ? password : undefined,
        }),
      })

      onServerCreated()
      handleClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not connect server")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl rounded-lg border border-line bg-surface p-6 shadow-card transition-all">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 rounded-md p-1 text-ink-muted hover:bg-canvas hover:text-ink-strong"
          aria-label="Close modal"
        >
          <X className="size-5" />
        </button>

        {/* Screen 1: Mode Selection */}
        {mode === "SELECT_MODE" && (
          <div>
            <h2 className="font-heading text-xl font-medium tracking-[-0.02em] text-ink-strong">
              Connect a server
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Choose how you want to add a server to TisiOps.
            </p>

            {comingSoonAlert && (
              <div className="mt-4 rounded-[6px] border border-line-warm bg-canvas p-3 text-xs text-ink-default">
                <span className="font-semibold text-brand">Buy from TisiOps</span> managed servers is coming soon. This will let you create a managed Ubuntu server directly from TisiOps without bringing your own server.
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Card 1: BYOS */}
              <div className="flex flex-col justify-between rounded-lg border border-line-warm bg-surface p-5 transition-all hover:border-brand/40 hover:shadow-subtle">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-[4px] border border-[#cfe6dc] bg-[#f2f9f6] px-2 py-0.5 text-xs font-semibold text-[#0f6b4f]">
                      Available
                    </span>
                    <ServerIcon className="size-5 text-brand" />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-ink-strong">
                    Connect Your Own Server
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                    Use an existing Ubuntu/VPS/cloud server from AWS, Hetzner, DigitalOcean, Vultr, Linode, Excloud, or any provider.
                  </p>
                </div>

                <button
                  onClick={() => setMode("BYOS")}
                  className={`mt-6 w-full ${primaryButton}`}
                >
                  Continue
                  <ChevronRight className="ml-1 size-4" />
                </button>
              </div>

              {/* Card 2: Buy from TisiOps */}
              <div className="flex flex-col justify-between rounded-lg border border-line-warm bg-canvas/60 p-5 opacity-80">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-[4px] border border-line-warm bg-canvas px-2 py-0.5 text-xs font-medium text-ink-muted">
                      Coming soon
                    </span>
                    <Lock className="size-5 text-ink-muted" />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-ink-strong">
                    Buy from TisiOps
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                    Get a managed server directly from TisiOps. TisiOps will provision, configure, and manage it for you.
                  </p>
                </div>

                <button
                  onClick={() => setComingSoonAlert(true)}
                  className={`mt-6 w-full ${secondaryButton} cursor-not-allowed`}
                >
                  Coming Soon
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Screen 2: BYOS Wizard */}
        {mode === "BYOS" && (
          <div>
            {/* Header & Stepper Indicator */}
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h2 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink-strong">
                  Bring Your Own Server (BYOS)
                </h2>
                <p className="text-xs text-ink-muted">
                  Step {step} of 5: {stepTitle(step)}
                </p>
              </div>

              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <div
                    key={s}
                    className={`h-1.5 w-6 rounded-full transition-all ${
                      s === step
                        ? "bg-brand"
                        : s < step
                        ? "bg-brand/40"
                        : "bg-line-warm"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* STEP 1: Provider */}
            {step === 1 && (
              <div className="mt-5">
                <label className="block text-sm font-medium text-ink-strong">
                  Where is this server hosted?
                </label>
                <p className="mt-1 text-xs text-ink-muted">
                  Select your provider for metadata labeling. No provider API credentials required.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PROVIDERS.map((p) => {
                    const isSelected = provider === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProvider(p.id)}
                        className={`flex items-center gap-2 rounded-[6px] border p-3 text-left text-xs font-medium transition-all ${
                          isSelected
                            ? "border-brand bg-brand-soft text-brand font-semibold"
                            : "border-line-warm bg-surface text-ink-default hover:bg-canvas"
                        }`}
                      >
                        <ServerIcon className="size-4 shrink-0" />
                        <span>{p.name}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    className={primaryButton}
                  >
                    Next: Server Details
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Server Details */}
            {step === 2 && (
              <div className="mt-5 space-y-4">
                <div>
                  <label className={labelClass}>Server name</label>
                  <input
                    type="text"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    placeholder="e.g. ubuntu-server-prod-01 (Auto-generated if empty)"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Public IP address or Hostname *</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="e.g. 13.234.12.56 or server.example.com"
                    className={inputClass}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>SSH port</label>
                    <input
                      type="number"
                      value={sshPort}
                      onChange={(e) => setSshPort(Number(e.target.value) || 22)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>OS type</label>
                    <input
                      type="text"
                      value={osType}
                      onChange={(e) => setOsType(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="rounded-[6px] border border-line-warm bg-canvas p-3 text-xs text-ink-muted">
                  For now, TisiOps supports Ubuntu servers best. Other Linux servers may work later.
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <button
                    onClick={() => setStep(1)}
                    className={secondaryButton}
                  >
                    Back
                  </button>
                  <button
                    disabled={!host.trim()}
                    onClick={() => setStep(3)}
                    className={primaryButton}
                  >
                    Next: Authentication
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Authentication */}
            {step === 3 && (
              <div className="mt-5 space-y-4">
                <div>
                  <label className={labelClass}>SSH username</label>
                  <input
                    type="text"
                    value={sshUsername}
                    onChange={(e) => setSshUsername(e.target.value)}
                    placeholder="ubuntu"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Authentication method</label>
                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setAuthType("key")}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-[6px] border p-2.5 text-xs font-medium ${
                        authType === "key"
                          ? "border-brand bg-brand-soft text-brand font-semibold"
                          : "border-line-warm bg-surface text-ink-default hover:bg-canvas"
                      }`}
                    >
                      <Key className="size-4" />
                      SSH Private Key
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthType("password")}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-[6px] border p-2.5 text-xs font-medium ${
                        authType === "password"
                          ? "border-brand bg-brand-soft text-brand font-semibold"
                          : "border-line-warm bg-surface text-ink-default hover:bg-canvas"
                      }`}
                    >
                      <Lock className="size-4" />
                      Password
                    </button>
                  </div>
                </div>

                {authType === "key" ? (
                  <>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className={labelClass}>SSH private key *</label>
                        <span className="text-[11px] text-ink-muted">
                          (e.g., contents of <code>id_rsa</code> or <code>.pem</code> file)
                        </span>
                      </div>
                      <textarea
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                        rows={5}
                        className="mt-1.5 w-full rounded-[6px] border border-line-warm bg-surface p-3 font-mono text-xs text-ink-strong placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-none"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Passphrase (optional)</label>
                      <input
                        type="password"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Optional passphrase for key"
                        className={inputClass}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className={labelClass}>SSH password *</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter server SSH password"
                      className={inputClass}
                    />
                  </div>
                )}

                <div className="flex items-start gap-2.5 rounded-[6px] border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p>
                    <strong>Security Warning:</strong> Credentials are used only to verify and connect to your server. They must never be shown in logs, frontend storage, or AI messages.
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <button
                    onClick={() => setStep(2)}
                    className={secondaryButton}
                  >
                    Back
                  </button>
                  <button
                    disabled={
                      authType === "key" ? !privateKey.trim() : !password.trim()
                    }
                    onClick={() => {
                      setStep(4)
                      handleTestConnection()
                    }}
                    className={primaryButton}
                  >
                    Next: Test Connection
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Test Connection */}
            {step === 4 && (
              <div className="mt-5 space-y-4">
                <p className="text-xs text-ink-muted">
                  Testing SSH reachability and collecting system specs from <strong className="text-ink-strong">{host}</strong>...
                </p>

                {isTesting ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-line-warm bg-canvas py-12">
                    <Loader2 className="size-8 animate-spin text-brand" />
                    <p className="mt-3 text-sm font-medium text-ink-strong">
                      Connecting via SSH...
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Checking reachability, authentication, Docker, and sudo privileges
                    </p>
                  </div>
                ) : testResult ? (
                  <div>
                    {testResult.ok ? (
                      <div className="rounded-lg border border-[#cfe6dc] bg-[#f2f9f6] p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#0f6b4f] dark:text-emerald-400">
                          <CheckCircle2 className="size-5" />
                          Server connected successfully
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                          <div className="rounded-[6px] border border-line-warm/50 bg-surface p-2.5">
                            <span className="text-ink-muted">OS</span>
                            <p className="mt-0.5 font-medium text-ink-strong">{testResult.details?.os || "Ubuntu 22.04"}</p>
                          </div>
                          <div className="rounded-[6px] border border-line-warm/50 bg-surface p-2.5">
                            <span className="text-ink-muted">CPU</span>
                            <p className="mt-0.5 font-medium text-ink-strong">{testResult.details?.cpuInfo || "Detected"}</p>
                          </div>
                          <div className="rounded-[6px] border border-line-warm/50 bg-surface p-2.5">
                            <span className="text-ink-muted">Memory</span>
                            <p className="mt-0.5 font-medium text-ink-strong">{testResult.details?.memoryMb ? `${testResult.details.memoryMb} MB` : "Detected"}</p>
                          </div>
                          <div className="rounded-[6px] border border-line-warm/50 bg-surface p-2.5">
                            <span className="text-ink-muted">Disk</span>
                            <p className="mt-0.5 font-medium text-ink-strong">{testResult.details?.diskGb ? `${testResult.details.diskGb} GB` : "Detected"}</p>
                          </div>
                          <div className="rounded-[6px] border border-line-warm/50 bg-surface p-2.5">
                            <span className="text-ink-muted">Docker Status</span>
                            <p className="mt-0.5 font-medium text-ink-strong">
                              {testResult.details?.dockerStatus === "INSTALLED" ? "Installed" : "Not Installed"}
                            </p>
                          </div>
                          <div className="rounded-[6px] border border-line-warm/50 bg-surface p-2.5">
                            <span className="text-ink-muted">Sudo Status</span>
                            <p className="mt-0.5 font-medium text-ink-strong">
                              {testResult.details?.sudoStatus === "PASSWORDLESS" ? "Passwordless Sudo" : "Access OK"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-[#f0d3cc] bg-[#fdf4f2] p-4 text-xs text-[#a8341f]">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <AlertCircle className="size-5 shrink-0" />
                          Connection failed
                        </div>
                        <p className="mt-2 font-medium">{testResult.error}</p>
                        <p className="mt-2 text-ink-muted">
                          Make sure the SSH port ({sshPort}) is open in your cloud provider security groups/firewall.
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="mt-6 flex items-center justify-between">
                  <button
                    onClick={() => setStep(3)}
                    className={secondaryButton}
                  >
                    Back
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={handleTestConnection}
                      className={secondaryButton}
                      disabled={isTesting}
                    >
                      Retest Connection
                    </button>
                    <button
                      disabled={!testResult?.ok || isTesting}
                      onClick={() => setStep(5)}
                      className={primaryButton}
                    >
                      Next: Review & Connect
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: Review & Connect */}
            {step === 5 && (
              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-line bg-canvas p-4 text-xs space-y-3">
                  <h3 className="font-semibold text-sm text-ink-strong">Server Summary</h3>

                  <div className="grid grid-cols-2 gap-y-2 text-xs">
                    <div>
                      <span className="text-ink-muted">Provider:</span>{" "}
                      <span className="font-medium text-ink-strong">{provider}</span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Server Name:</span>{" "}
                      <span className="font-medium text-ink-strong">{serverName || `ubuntu-server-${host}`}</span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Host IP:</span>{" "}
                      <span className="font-medium text-ink-strong">{host}</span>
                    </div>
                    <div>
                      <span className="text-ink-muted">SSH Username / Port:</span>{" "}
                      <span className="font-medium text-ink-strong">{sshUsername} : {sshPort}</span>
                    </div>
                    <div>
                      <span className="text-ink-muted">OS:</span>{" "}
                      <span className="font-medium text-ink-strong">{testResult?.details?.os || osType}</span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Docker:</span>{" "}
                      <span className="font-medium text-ink-strong">{testResult?.details?.dockerStatus === "INSTALLED" ? "Installed" : "Not installed"}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[6px] border border-line-warm bg-surface p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-ink-strong">Next Action: Prepare Server</p>
                      <p className="text-ink-muted">Configure Docker, reverse proxy, and monitoring dependencies.</p>
                    </div>
                    <span className="rounded-[4px] border border-line-warm bg-canvas px-2 py-0.5 text-xs text-ink-muted">
                      Coming soon
                    </span>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <button
                    onClick={() => setStep(4)}
                    className={secondaryButton}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConnectServer}
                    disabled={isSubmitting}
                    className={primaryButton}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Connecting Server...
                      </>
                    ) : (
                      "Connect Server"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function stepTitle(step: number): string {
  switch (step) {
    case 1:
      return "Provider"
    case 2:
      return "Server Details"
    case 3:
      return "Authentication"
    case 4:
      return "Test Connection"
    case 5:
      return "Review and Connect"
    default:
      return ""
  }
}
