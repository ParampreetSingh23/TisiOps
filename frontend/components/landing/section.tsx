/**
 * Shared landing-page shell.
 *
 * One container so every section below the hero lines up with it exactly —
 * the hero's max width and gutters are repeated here rather than re-guessed
 * per section, which is how landing pages drift out of alignment.
 */
export function Section({
  id,
  children,
  className = "",
}: {
  id?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`scroll-mt-24 ${className}`}>
      <div className="mx-auto w-full max-w-[1400px] px-5 py-20 sm:px-8 lg:px-14 lg:py-28">
        {children}
      </div>
    </section>
  )
}

/** Small orange label. The one place a section is allowed to use the accent. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[4px] border border-brand/30 bg-brand-soft px-3 py-1.5 text-sm font-semibold tracking-[-0.01em] text-brand">
      {children}
    </span>
  )
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-[clamp(2rem,3.4vw,3rem)] leading-[1.15] font-medium tracking-[-0.035em] text-balance text-ink">
      {children}
    </h2>
  )
}

export function SectionLead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 max-w-[620px] text-lg leading-relaxed text-ink-muted">
      {children}
    </p>
  )
}
