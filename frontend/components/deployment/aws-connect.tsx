"use client"

import { Check, Loader2, ShieldAlert, X } from "lucide-react"
import { useEffect, useState } from "react"

import { Select } from "@/components/ui/select"
import { apiFetch } from "@/lib/api"
import {
  card,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "@/lib/ui"
import { AWS_REGIONS } from "@tisiops/server/constants"

/**
 * AWS connection step. Credentials live in component state only for as long
 * as the request needs them: nothing is written to localStorage, put in a URL,
 * or logged, and the secret is dropped from state the moment a save succeeds.
 */

type Identity = {
  accountId: string | null
  arn: string | null
  userId: string | null
  region: string
}

type Connection = {
  id: string
  name: string
  defaultRegion: string
  awsAccountId: string | null
  awsArn: string | null
  awsUserId: string | null
  maskedAccessKeyId: string | null
  lastVerifiedAt: string | null
}

type Phase = "idle" | "testing" | "verified" | "failed" | "saving" | "connected"

// Warm-tuned state colours. DESIGN.md keeps orange as the only accent; these
// two exist because "verified" and "rejected" are states orange cannot say.
const VERIFIED = "border-[#cfe6dc] bg-[#f2f9f6] text-[#0f6b4f]"
const REJECTED = "border-[#f0d3cc] bg-[#fdf4f2] text-[#a8341f]"

const SECURITY_NOTES = [
  "Never use root credentials.",
  "Use a limited IAM user for TisiOps.",
  "No AWS resources will be created during this step.",
  "TisiOps only verifies your AWS identity now. Deployment actions will require approval later.",
]

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—"
}

/**
 * The signature of this step: AWS's own answer, shown verbatim in monospace.
 * The proof is the readout, not a reassuring sentence about it.
 */
function IdentityReceipt({
  rows,
}: {
  rows: { label: string; value: string }[]
}) {
  return (
    <dl className="mt-5 border-l-2 border-brand pl-4">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4"
        >
          <dt className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase sm:w-44 sm:shrink-0 sm:pt-0.5">
            {row.label}
          </dt>
          <dd className="font-mono text-sm break-all text-ink-strong">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function AwsConnect({
  onConnected,
  onContinue,
}: {
  onConnected: (connected: boolean) => void
  onContinue: () => void
}) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [showNextNote, setShowNextNote] = useState(false)

  const [name, setName] = useState("")
  const [accessKeyId, setAccessKeyId] = useState("")
  const [secretAccessKey, setSecretAccessKey] = useState("")
  const [region, setRegion] = useState(AWS_REGIONS[0].id as string)
  const [confirmed, setConfirmed] = useState(false)

  // An existing connection means this step is already done.
  useEffect(() => {
    let active = true

    apiFetch<{ connected: boolean; connection: Connection | null }>(
      "/api/providers/aws/status"
    )
      .then((status) => {
        if (!active || !status.connected || !status.connection) return
        setConnection(status.connection)
        setPhase("connected")
        onConnected(true)
      })
      .catch(() => {
        // Not being able to read the status is not an error worth showing —
        // the form below is the fallback either way.
      })

    return () => {
      active = false
    }
  }, [onConnected])

  /** Any credential edit invalidates the previous verification. */
  function editCredential(setter: (value: string) => void) {
    return (value: string) => {
      setter(value)
      if (phase === "verified" || phase === "failed") {
        setPhase("idle")
        setMessage(null)
        setIdentity(null)
      }
    }
  }

  const canTest =
    accessKeyId.trim() !== "" &&
    secretAccessKey !== "" &&
    phase !== "testing" &&
    phase !== "saving"

  const canSave = phase === "verified" && name.trim().length >= 2 && confirmed

  async function testConnection() {
    setPhase("testing")
    setMessage(null)

    try {
      const result = await apiFetch<Identity>("/api/providers/aws/test", {
        method: "POST",
        body: JSON.stringify({
          provider: "AWS",
          accessKeyId: accessKeyId.trim(),
          secretAccessKey,
          region,
        }),
      })
      setIdentity(result)
      setPhase("verified")
    } catch (error) {
      setIdentity(null)
      setMessage(error instanceof Error ? error.message : "Connection failed")
      setPhase("failed")
    }
  }

  async function saveConnection() {
    setPhase("saving")
    setMessage(null)

    try {
      const saved = await apiFetch<Connection>("/api/providers/aws", {
        method: "POST",
        body: JSON.stringify({
          provider: "AWS",
          name: name.trim(),
          accessKeyId: accessKeyId.trim(),
          secretAccessKey,
          region,
          confirmedNotRoot: confirmed,
        }),
      })

      // The secret has done its job — drop it before anything else renders.
      setSecretAccessKey("")
      setAccessKeyId("")
      setConnection(saved)
      setPhase("connected")
      onConnected(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save")
      setPhase("verified")
    }
  }

  if (phase === "connected" && connection) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className={card}>
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-[#0f6b4f] text-white">
              <Check className="size-3.5" aria-hidden />
            </span>
            <h3 className="font-heading text-lg font-medium tracking-[-0.02em] text-ink">
              AWS Connected
            </h3>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            {connection.name} · verified with sts:GetCallerIdentity, a read-only
            call. Nothing was created in your account.
          </p>

          <IdentityReceipt
            rows={[
              {
                label: "AWS Account ID",
                value: connection.awsAccountId ?? "—",
              },
              { label: "IAM ARN", value: connection.awsArn ?? "—" },
              { label: "Default Region", value: connection.defaultRegion },
              {
                label: "Access Key",
                value: connection.maskedAccessKeyId ?? "—",
              },
              {
                label: "Last Verified",
                value: formatTime(connection.lastVerifiedAt),
              },
            ]}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setShowNextNote(true)
              onContinue()
            }}
            className={primaryButton}
          >
            Continue to GitHub Connection
          </button>
          {showNextNote ? (
            <p className="text-sm text-ink-muted">
              GitHub connection will be added next.
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-5 flex items-start gap-2.5 rounded-[6px] border border-line bg-brand-soft px-4 py-3 text-sm text-ink-default">
        <ShieldAlert
          className="mt-0.5 size-4 shrink-0 text-brand"
          aria-hidden
        />
        Use a limited IAM user or role. Never use AWS root credentials. No
        infrastructure changes will happen until you approve a deployment plan.
      </p>

      <form
        className={card}
        onSubmit={(event) => {
          event.preventDefault()
          if (canTest) void testConnection()
        }}
      >
        <label className="block">
          <span className={labelClass}>Connection Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Production AWS"
            autoComplete="off"
            className={inputClass}
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>AWS Access Key ID</span>
            <input
              value={accessKeyId}
              onChange={(event) =>
                editCredential(setAccessKeyId)(event.target.value)
              }
              placeholder="AKIA…"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
          </label>

          <label className="block">
            <span className={labelClass}>AWS Secret Access Key</span>
            <input
              type="password"
              value={secretAccessKey}
              onChange={(event) =>
                editCredential(setSecretAccessKey)(event.target.value)
              }
              placeholder="••••••••••••••••••••"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
          </label>
        </div>

        <div className="mt-4">
          <span className={labelClass}>Default Region</span>
          <Select
            label="Default Region"
            value={region}
            onValueChange={setRegion}
            options={AWS_REGIONS.map((option) => ({
              value: option.id,
              label: option.id,
              hint: option.city,
            }))}
          />
        </div>

        <label className="mt-5 flex items-start gap-2.5 text-sm text-ink-default">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-brand"
          />
          I confirm this is not a root AWS account credential.
        </label>

        {/* One live region for every outcome, so screen readers hear the result. */}
        <div aria-live="polite" className="empty:hidden">
          {phase === "testing" ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-ink-muted">
              <Loader2
                className="size-4 motion-safe:animate-spin"
                aria-hidden
              />
              Testing connection with AWS…
            </p>
          ) : null}

          {phase === "verified" && identity ? (
            <div className={`mt-5 rounded-[6px] border px-4 py-3 ${VERIFIED}`}>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Check className="size-4 shrink-0" aria-hidden />
                Connection successful
              </p>
              <p className="mt-1.5 font-mono text-xs break-all">
                {identity.accountId} · {identity.arn}
              </p>
              <p className="mt-2 text-sm">
                Name the connection and confirm the checkbox to save it.
              </p>
            </div>
          ) : null}

          {phase === "failed" ? (
            <p
              className={`mt-5 flex items-start gap-2 rounded-[6px] border px-4 py-3 text-sm ${REJECTED}`}
            >
              <X className="mt-0.5 size-4 shrink-0" aria-hidden />
              {message ?? "Connection failed"}
            </p>
          ) : null}

          {phase === "saving" ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-ink-muted">
              <Loader2
                className="size-4 motion-safe:animate-spin"
                aria-hidden
              />
              Saving the connection…
            </p>
          ) : null}

          {message && phase === "verified" ? (
            <p
              className={`mt-3 rounded-[6px] border px-4 py-3 text-sm ${REJECTED}`}
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={!canTest}
            className={phase === "verified" ? secondaryButton : primaryButton}
          >
            {phase === "testing" ? "Testing…" : "Test Connection"}
          </button>

          <button
            type="button"
            disabled={!canSave}
            onClick={() => void saveConnection()}
            className={primaryButton}
          >
            {phase === "saving" ? "Saving…" : "Save and Continue"}
          </button>
        </div>
      </form>

      <ul className="mt-5 flex flex-col gap-1.5">
        {SECURITY_NOTES.map((note) => (
          <li key={note} className="flex gap-2.5 text-sm text-ink-muted">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-muted" />
            {note}
          </li>
        ))}
      </ul>
    </div>
  )
}
