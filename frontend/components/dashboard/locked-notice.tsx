import { Lock } from "lucide-react"

/** Shown instead of a redirect when the destination itself is locked. */
export function LockedNotice({ feature }: { feature: string }) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-line bg-surface p-8 text-center shadow-card">
      <span className="mx-auto flex size-12 items-center justify-center rounded-[8px] bg-canvas text-ink-muted">
        <Lock className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 font-heading text-lg font-medium tracking-[-0.02em] text-ink">
        {feature} is locked
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        An admin turned this off. Ask them to enable it if you need access.
      </p>
    </div>
  )
}
