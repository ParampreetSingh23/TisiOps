export function Placeholder({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div>
      <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] text-ink">
        {title}
      </h1>
      <p className="mt-2 text-base text-ink-muted">{description}</p>

      <div className="mt-8 rounded-lg border border-dashed border-line-warm bg-surface p-8 text-sm text-ink-muted">
        Nothing here yet.
      </div>
    </div>
  )
}
