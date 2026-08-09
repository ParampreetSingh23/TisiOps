"use client"

import { useReverification, useUser } from "@clerk/nextjs"
import { SiGithub } from "@icons-pack/react-simple-icons"
import { AlertCircle, Check, Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { apiFetch } from "@/lib/api"
import { card, primaryButton, secondaryButton } from "@/lib/ui"
import type { GithubStatus } from "@tisiops/server/services/github"

/**
 * GitHub connection card.
 *
 * Signing in with GitHub and granting TisiOps repository access are separate
 * things, and this component never conflates them: the state comes from the
 * server, which checks the actual token, and "GitHub Connected" appears only
 * for `repo_access_granted`. No token is ever held here.
 */

/** Private repositories included; GitHub prompts the user to approve it. */
const REPO_SCOPE = "repo"

/** Never throws: an unreachable API is itself a connection error to show. */
async function fetchStatus(): Promise<GithubStatus> {
  try {
    return await apiFetch<GithubStatus>("/api/integrations/github/status")
  } catch {
    return {
      state: "connection_error",
      username: null,
      grantedScopes: [],
      error: "Could not check the GitHub connection.",
    }
  }
}

function StatusRow({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode
  title: string
  detail?: string
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {icon}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-strong">{title}</p>
        {detail ? (
          <p className="mt-0.5 text-sm text-ink-muted">{detail}</p>
        ) : null}
      </div>
    </div>
  )
}

export function GithubConnect({
  repositoriesHref,
  initialStatus,
}: {
  repositoriesHref?: string
  /** Server-resolved status, when the page already had it. Skips the fetch. */
  initialStatus?: GithubStatus
}) {
  const { user, isLoaded } = useUser()
  const [status, setStatus] = useState<GithubStatus | null>(
    initialStatus ?? null
  )
  const [isBusy, setIsBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [dismissedModal, setDismissedModal] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Connecting an account can require step-up verification.
  const createExternalAccount = useReverification(
    (args: Parameters<NonNullable<typeof user>["createExternalAccount"]>[0]) =>
      user?.createExternalAccount(args)
  )

  useEffect(() => {
    if (initialStatus) return
    let active = true

    fetchStatus().then((next) => {
      if (active) setStatus(next)
    })

    return () => {
      active = false
    }
  }, [initialStatus])

  // Ask once, as soon as a GitHub login without repository access is seen.
  const shouldAsk = status?.state === "github_login_detected" && !dismissedModal

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    // <dialog> gives focus trapping, Esc, and the backdrop for free.
    if (shouldAsk && !dialog.open) dialog.showModal()
    if (!shouldAsk && dialog.open) dialog.close()
  }, [shouldAsk])

  /**
   * Sends the user to GitHub to approve repository access. An existing GitHub
   * login is re-authorized rather than re-created — creating it again would
   * fail, since the account is already linked.
   */
  async function grantRepositoryAccess() {
    setIsBusy(true)
    setActionError(null)

    try {
      const existing = user?.externalAccounts.find(
        (account) => account.provider === "github"
      )

      const account = existing
        ? await existing.reauthorize({
            additionalScopes: [REPO_SCOPE],
            redirectUrl: window.location.pathname,
          })
        : await createExternalAccount({
            strategy: "oauth_github",
            additionalScopes: [REPO_SCOPE],
            redirectUrl: window.location.pathname,
          })

      const redirect = account?.verification?.externalVerificationRedirectURL
      if (!redirect) {
        setActionError("GitHub did not return an authorization link.")
        setIsBusy(false)
        return
      }

      // Full-page navigation: this is a cross-origin URL.
      window.location.href = redirect.href
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not reach GitHub"
      )
      setIsBusy(false)
    }
  }

  /** Unlinks the GitHub account in Clerk — TisiOps stores no token of its own. */
  async function disconnect() {
    setIsBusy(true)
    setActionError(null)

    try {
      const existing = user?.externalAccounts.find(
        (account) => account.provider === "github"
      )
      await existing?.destroy()
      await user?.reload()
      setStatus(await fetchStatus())
    } catch (error) {
      // Clerk refuses if this is the only way the user can sign in.
      setActionError(
        error instanceof Error ? error.message : "Could not disconnect GitHub"
      )
    } finally {
      setIsBusy(false)
    }
  }

  if (!isLoaded || !status) {
    return (
      <div className={`${card} flex items-center gap-3 text-sm text-ink-muted`}>
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        Checking GitHub connection…
      </div>
    )
  }

  const mark = (
    <SiGithub className="size-5 shrink-0 text-ink-strong" aria-hidden />
  )

  return (
    <>
      <div className={`${card} flex flex-wrap items-center gap-4`}>
        {status.state === "not_connected" ? (
          <>
            <StatusRow
              icon={mark}
              title="GitHub"
              detail="Connect GitHub so TisiOps can read the repository you want to deploy."
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void grantRepositoryAccess()}
              className={primaryButton}
            >
              Connect GitHub
            </button>
          </>
        ) : null}

        {status.state === "github_login_detected" ? (
          <>
            <StatusRow
              icon={mark}
              title="GitHub account detected"
              detail={
                status.username
                  ? `Signed in as ${status.username}. Repository access not granted.`
                  : "GitHub login detected, repository access not granted"
              }
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void grantRepositoryAccess()}
              className={primaryButton}
            >
              Allow Repository Access
            </button>
          </>
        ) : null}

        {status.state === "repo_access_granted" ? (
          <>
            <StatusRow
              icon={
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#0f6b4f] text-white">
                  <Check className="size-3" aria-hidden />
                </span>
              }
              title="GitHub Connected"
              detail={
                status.username
                  ? `Repository access granted for ${status.username}.`
                  : "Repository access granted."
              }
            />
            <div className="flex flex-wrap gap-3">
              {repositoriesHref ? (
                <a href={repositoriesHref} className={secondaryButton}>
                  View Repositories
                </a>
              ) : null}
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void disconnect()}
                className={secondaryButton}
              >
                Disconnect
              </button>
            </div>
          </>
        ) : null}

        {status.state === "connection_error" ? (
          <>
            <StatusRow
              icon={
                <AlertCircle
                  className="size-5 shrink-0 text-[#a8341f]"
                  aria-hidden
                />
              }
              title="GitHub connection failed"
              detail={
                status.error ?? "GitHub could not verify this connection."
              }
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void grantRepositoryAccess()}
              className={primaryButton}
            >
              Retry
            </button>
          </>
        ) : null}

        {actionError ? (
          <p
            role="alert"
            className="w-full rounded-[6px] border border-[#f0d3cc] bg-[#fdf4f2] px-3.5 py-2.5 text-sm text-[#a8341f]"
          >
            {actionError}
          </p>
        ) : null}
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setDismissedModal(true)}
        aria-labelledby="github-access-title"
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-6 text-ink-default shadow-float backdrop:bg-ink/20"
      >
        <h2
          id="github-access-title"
          className="font-heading text-lg font-medium tracking-[-0.02em] text-ink"
        >
          Allow TisiOps to access your GitHub repositories?
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
          You signed in with GitHub. To deploy repositories, TisiOps needs
          permission to read your GitHub repositories.
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={secondaryButton}
          >
            Not Now
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void grantRepositoryAccess()}
            className={primaryButton}
          >
            {isBusy ? (
              <>
                <Loader2
                  className="mr-2 size-4 motion-safe:animate-spin"
                  aria-hidden
                />
                Opening GitHub…
              </>
            ) : (
              "Allow Repository Access"
            )}
          </button>
        </div>
      </dialog>
    </>
  )
}
