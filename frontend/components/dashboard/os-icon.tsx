import {
  SiDebian,
  SiDebianHex,
  SiFedora,
  SiFedoraHex,
  SiLinux,
  SiLinuxHex,
  SiRedhat,
  SiRedhatHex,
  SiUbuntu,
  SiUbuntuHex,
} from "@icons-pack/react-simple-icons"

export function OsIcon({
  os,
  className = "size-4",
}: {
  os?: string
  className?: string
}) {
  const osLower = (os || "").toLowerCase()

  if (osLower.includes("ubuntu")) {
    return <SiUbuntu className={className} color={SiUbuntuHex} />
  }
  if (osLower.includes("debian")) {
    return <SiDebian className={className} color={SiDebianHex} />
  }
  if (osLower.includes("redhat") || osLower.includes("rhel")) {
    return <SiRedhat className={className} color={SiRedhatHex} />
  }
  if (osLower.includes("fedora")) {
    return <SiFedora className={className} color={SiFedoraHex} />
  }

  return <SiLinux className={className} color={SiLinuxHex ?? "#FCC624"} />
}
