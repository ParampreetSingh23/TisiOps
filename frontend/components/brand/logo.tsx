import Link from "next/link"

export function TisiOpsIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      className={`${className} shrink-0 rounded-[7px]`}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" fill="#FF4400" />
      <g
        transform="translate(16 16) scale(0.78) translate(-12 -12)"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m10.586 5.414-5.172 5.172" />
        <path d="m18.586 13.414-5.172 5.172" />
        <path d="M6 12h12" />
        <circle cx="12" cy="20" r="2" />
        <circle cx="12" cy="4" r="2" />
        <circle cx="20" cy="12" r="2" />
        <circle cx="4" cy="12" r="2" />
      </g>
    </svg>
  )
}

export function TisiOpsLogo({
  href = "/",
  className = "",
  showText = true,
  iconSize = "size-6",
}: {
  href?: string
  className?: string
  showText?: boolean
  iconSize?: string
}) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2.5 transition-opacity duration-150 hover:opacity-95 ${className}`}
    >
      <TisiOpsIcon className={iconSize} />
      {showText ? (
        <span className="font-heading text-lg font-semibold tracking-[-0.02em] text-ink-strong transition-colors duration-150 group-hover:text-brand">
          TisiOps
        </span>
      ) : null}
    </Link>
  )
}
