import {
  SiDigitalocean,
  SiDigitaloceanHex,
  SiGooglecloud,
  SiGooglecloudHex,
  SiHetzner,
  SiHetznerHex,
  SiN8n,
  SiN8nHex,
  SiPostgresql,
  SiPostgresqlHex,
  SiVercel,
} from "@icons-pack/react-simple-icons"
import { Server } from "lucide-react"

/**
 * Provider logos. GCP, DigitalOcean, and Hetzner come from simple-icons;
 * AWS and Azure are inlined from their official SVGs because the icon set
 * dropped both at the trademark owners' request. Custom VPS is not a brand,
 * so it uses a neutral server glyph.
 */

/** AWS publishes no square mark — this is the smile from the official wordmark. */
function AwsMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 118 304 64"
      className={className}
      fill="#FF9900"
      aria-hidden
    >
      <path d="M273.5,143.7c-32.9,24.3-80.7,37.2-121.8,37.2c-57.6,0-109.5-21.3-148.7-56.7c-3.1-2.8-0.3-6.6,3.4-4.4c42.4,24.6,94.7,39.5,148.8,39.5c36.5,0,76.6-7.6,113.5-23.2C274.2,133.6,278.9,139.7,273.5,143.7z" />
      <path d="M287.2,128.1c-4.2-5.4-27.8-2.6-38.5-1.3c-3.2,0.4-3.7-2.4-0.8-4.5c18.8-13.2,49.7-9.4,53.3-5c3.6,4.5-1,35.4-18.6,50.2c-2.7,2.3-5.3,1.1-4.1-1.9C282.5,155.7,291.4,133.4,287.2,128.1z" />
    </svg>
  )
}

function AzureMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden>
      <defs>
        <linearGradient
          id="tisiops-azure-a"
          x1="-1032.172"
          x2="-1059.213"
          y1="145.312"
          y2="65.426"
          gradientTransform="matrix(1 0 0 -1 1075 158)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#114a8b" />
          <stop offset="1" stopColor="#0669bc" />
        </linearGradient>
        <linearGradient
          id="tisiops-azure-b"
          x1="-1023.725"
          x2="-1029.98"
          y1="108.083"
          y2="105.968"
          gradientTransform="matrix(1 0 0 -1 1075 158)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopOpacity=".3" />
          <stop offset=".071" stopOpacity=".2" />
          <stop offset=".321" stopOpacity=".1" />
          <stop offset=".623" stopOpacity=".05" />
          <stop offset="1" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="tisiops-azure-c"
          x1="-1027.165"
          x2="-997.482"
          y1="147.642"
          y2="68.561"
          gradientTransform="matrix(1 0 0 -1 1075 158)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#3ccbf4" />
          <stop offset="1" stopColor="#2892df" />
        </linearGradient>
      </defs>
      <path
        fill="url(#tisiops-azure-a)"
        d="M33.338 6.544h26.038l-27.03 80.087a4.152 4.152 0 0 1-3.933 2.824H8.149a4.145 4.145 0 0 1-3.928-5.47L29.404 9.368a4.152 4.152 0 0 1 3.934-2.825z"
      />
      <path
        fill="#0078d4"
        d="M71.175 60.261h-41.29a1.911 1.911 0 0 0-1.305 3.309l26.532 24.764a4.171 4.171 0 0 0 2.846 1.121h23.38z"
      />
      <path
        fill="url(#tisiops-azure-b)"
        d="M33.338 6.544a4.118 4.118 0 0 0-3.943 2.879L4.252 83.917a4.14 4.14 0 0 0 3.908 5.538h20.787a4.443 4.443 0 0 0 3.41-2.9l5.014-14.777 17.91 16.705a4.237 4.237 0 0 0 2.666.972H81.24L71.024 60.261l-29.781.007L59.47 6.544z"
      />
      <path
        fill="url(#tisiops-azure-c)"
        d="M66.595 9.364a4.145 4.145 0 0 0-3.928-2.82H33.648a4.146 4.146 0 0 1 3.928 2.82l25.184 74.62a4.146 4.146 0 0 1-3.928 5.472h29.02a4.146 4.146 0 0 0 3.927-5.472z"
      />
    </svg>
  )
}

export function ProviderIcon({
  id,
  className = "",
}: {
  id: string
  className?: string
}) {
  // Fixed slot so wordmark-shaped logos and square marks line up in a row.
  const slot = `inline-flex h-5 w-7 shrink-0 items-center justify-center ${className}`

  switch (id) {
    case "aws":
      return (
        <span className={slot}>
          <AwsMark className="h-3.5 w-7" />
        </span>
      )
    case "azure":
      return (
        <span className={slot}>
          <AzureMark className="size-5" />
        </span>
      )
    case "gcp":
      return (
        <span className={slot}>
          <SiGooglecloud className="size-5" color={SiGooglecloudHex} />
        </span>
      )
    case "digitalocean":
      return (
        <span className={slot}>
          <SiDigitalocean className="size-5" color={SiDigitaloceanHex} />
        </span>
      )
    case "hetzner":
      return (
        <span className={slot}>
          <SiHetzner className="size-5" color={SiHetznerHex} />
        </span>
      )
    case "vercel":
      return (
        <span className={slot}>
          <SiVercel className="size-4 text-ink-strong" />
        </span>
      )
    case "n8n":
      return (
        <span className={slot}>
          <SiN8n className="size-5" color={SiN8nHex ?? "#FF6D5A"} />
        </span>
      )
    case "postgres":
      return (
        <span className={slot}>
          <SiPostgresql className="size-5" color={SiPostgresqlHex} />
        </span>
      )
    case "custom-vps":
      return (
        <span className={slot}>
          <Server className="size-5 text-ink-muted" aria-hidden />
        </span>
      )
    default:
      return null
  }
}
