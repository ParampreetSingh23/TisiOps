/**
 * What the server runs on first boot, and what we ask it about itself after.
 *
 * Kept apart from run.ts so it stays pure — no database, no SSH, no AWS — and
 * therefore checkable without a connection to any of them.
 */

/**
 * Cloud-init for a server with no application on it.
 *
 * Adds swap so a t3.micro survives an apt upgrade, and opens only the ports the
 * template declares. Deliberately installs nothing else: this template's whole
 * promise is a clean Ubuntu machine.
 */
export function buildCloudInit(): string {
  return `#!/bin/bash
set -euxo pipefail

if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
`
}

/** One shell command, so the facts we store come from the machine itself. */
export const SYSTEM_FACTS = [
  '. /etc/os-release && echo "OS=$PRETTY_NAME"',
  'echo "CPU=$(nproc) vCPU"',
  "echo \"MEM=$(awk '/MemTotal/ {printf \"%d\", $2/1024}' /proc/meminfo)\"",
  "echo \"DISK=$(df -BG --output=size / | tail -1 | tr -dc '0-9')\"",
  '(command -v docker >/dev/null && echo "DOCKER=INSTALLED") || echo "DOCKER=NOT_INSTALLED"',
].join("; ")

export type SystemFacts = {
  osType: string
  osVersion: string | null
  cpuInfo: string | null
  memoryMb: number | null
  diskGb: number | null
  dockerStatus: string
}

/**
 * Reads the fact block back.
 *
 * A missing or unparseable line becomes null rather than a zero: the dashboard
 * can say nothing, but it must not say the server has 0 GB of disk.
 */
export function parseSystemFacts(output: string): SystemFacts {
  const read = (key: string) =>
    output.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? ""

  const memoryMb = Number.parseInt(read("MEM"), 10)
  const diskGb = Number.parseInt(read("DISK"), 10)

  return {
    osType: "Ubuntu",
    osVersion: read("OS") || null,
    cpuInfo: read("CPU") || null,
    memoryMb: Number.isFinite(memoryMb) && memoryMb > 0 ? memoryMb : null,
    diskGb: Number.isFinite(diskGb) && diskGb > 0 ? diskGb : null,
    dockerStatus: read("DOCKER") === "INSTALLED" ? "INSTALLED" : "NOT_INSTALLED",
  }
}
