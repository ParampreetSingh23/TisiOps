/**
 * Pure production-runtime parsing. No Prisma, no SSH, no secrets — kept
 * separate so it can be unit-checked without a database or a live server.
 *
 * The script is read-only by construction (grep, nproc, free, df, docker
 * ps/inspect/list, git rev-parse). Nothing is installed, restarted, pulled or
 * written.
 */

export type ProductionRuntime = {
  os: string | null
  cpuCount: number | null
  memoryMb: number | null
  diskGb: number | null
  docker: { status: string; version: string | null }
  composeProjects: string[]
  containers: { name: string; image: string; status: string; ports: string }[]
  images: string[]
  volumes: string[]
  networks: string[]
  runtimes: { name: string; version: string }[]
  systemdServices: { unit: string; state: string }[]
  postgres: string
  redis: string
  nginx: string
  caddy: string
  domains: string[]
  git: { repoPath: string | null; branch: string | null; commit: string | null; remote: string | null }
}

/**
 * Read-only inspection script. Echoes every fact as a `<<<SECTION>>> value`
 * line the parser understands.
 */
export const PRODUCTION_RUNTIME_SCRIPT = `
osr=$(cat /etc/os-release 2>/dev/null)
echo "<<<OS>>> $(printf '%s' "$osr" | grep -m1 PRETTY_NAME= | cut -d= -f2 | tr -d '"')"
echo "<<<CPU>>> $(nproc 2>/dev/null || echo 0)"
echo "<<<RAM_MB>>> $(free -m 2>/dev/null | awk '/Mem:/{print $2}' || echo 0)"
echo "<<<DISK_GB>>> $(df -h / 2>/dev/null | awk 'NR==2{print $2}' | tr -dc '0-9')"

if docker info >/dev/null 2>&1; then
  echo "<<<DOCKER>>> Running|$(docker version --format '{{.Server.Version}}' 2>/dev/null)"
  echo "<<<COMPOSE>>> $(docker compose ls --format '{{.Name}}' 2>/dev/null | tr '\\n' ',' | sed 's/,$//')"
  docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}' 2>/dev/null | while IFS= read -r c; do echo "<<<CONTAINERS>>> $c"; done
  docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | head -50 | while IFS= read -r i; do echo "<<<IMAGES>>> $i"; done
  docker volume ls --format '{{.Name}}' 2>/dev/null | while IFS= read -r v; do echo "<<<VOLUMES>>> $v"; done
  docker network ls --format '{{.Name}}' 2>/dev/null | while IFS= read -r n; do echo "<<<NETWORKS>>> $n"; done
else
  echo "<<<DOCKER>>> Not running"
  echo "<<<COMPOSE>>> "
fi

node -v 2>/dev/null | sed 's/^/<<<RUNTIMES>>> node|/'
python3 -V 2>/dev/null | sed 's/^/<<<RUNTIMES>>> python|/;s/Python //'
bun -v 2>/dev/null | sed 's/^/<<<RUNTIMES>>> bun|/'

systemctl list-units --type=service --state=running --no-pager --plain 2>/dev/null \
  | awk 'NR>1{print $1"|active"}' \
  | while IFS= read -r s; do echo "<<<SERVICES>>> $s"; done

pg_isready -q 2>/dev/null && echo "<<<PG>>> running" || echo "<<<PG>>> down"
redis-cli ping 2>/dev/null | grep -q PONG && echo "<<<REDIS>>> running" || echo "<<<REDIS>>> down"

systemctl is-active nginx 2>/dev/null && echo "<<<NGINX>>> active" \
  || (nginx -v 2>&1 | grep -q nginx && echo "<<<NGINX>>> installed" || echo "<<<NGINX>>> unavailable")
systemctl is-active caddy 2>/dev/null && echo "<<<CADDY>>> active" \
  || (caddy version 2>/dev/null | grep -q . && echo "<<<CADDY>>> installed" || echo "<<<CADDY>>> unavailable")

grep -rhoE 'ServerName[[:space:]]+[a-z0-9.-]+' /etc/caddy/Caddyfile /etc/nginx/sites-* 2>/dev/null \
  | awk '{print $2}' | while IFS= read -r d; do echo "<<<DOMAINS>>> $d"; done

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "<<<GIT_REPO>>> $(git rev-parse --show-toplevel 2>/dev/null)"
  echo "<<<GIT_BRANCH>>> $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "<<<GIT_COMMIT>>> $(git rev-parse --short HEAD 2>/dev/null)"
  echo "<<<GIT_REMOTE>>> $(git remote get-url origin 2>/dev/null)"
else
  echo "<<<GIT_REPO>>> "
fi
`

function num(value: string): number | null {
  if (value === "" || value === "0") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function split(value: string): [string, string, string, string] {
  const parts = value.split("|")
  return [parts[0] ?? "", parts[1] ?? "", parts[2] ?? "", parts[3] ?? ""]
}

/** Parses the discovery script output into a ProductionRuntime. Pure. */
export function parseProductionRuntime(output: string): ProductionRuntime {
  const result: ProductionRuntime = {
    os: null,
    cpuCount: null,
    memoryMb: null,
    diskGb: null,
    docker: { status: "Unknown", version: null },
    composeProjects: [],
    containers: [],
    images: [],
    volumes: [],
    networks: [],
    runtimes: [],
    systemdServices: [],
    postgres: "Unknown",
    redis: "Unknown",
    nginx: "Unknown",
    caddy: "Unknown",
    domains: [],
  git: { repoPath: null, branch: null, commit: null, remote: null },
}

  for (const raw of output.split("\n")) {
    const line = raw.trim()
    const match = line.match(/^<<<([A-Z_]+)>>>\s?(.*)$/)
    if (!match) continue
    const section = match[1]!
    const value = match[2] ?? ""

    switch (section) {
      case "OS":
        result.os = value || null
        break
      case "CPU":
        result.cpuCount = num(value)
        break
      case "RAM_MB":
        result.memoryMb = num(value)
        break
      case "DISK_GB":
        result.diskGb = num(value)
        break
      case "DOCKER": {
        const [status, version] = value.split("|")
        result.docker = { status: status || "Unknown", version: version || null }
        break
      }
      case "COMPOSE":
        result.composeProjects = value ? value.split(",").filter(Boolean) : []
        break
      case "CONTAINERS": {
        if (!value) break
        const [name, image, status, ports] = split(value)
        result.containers.push({ name, image, status, ports })
        break
      }
      case "IMAGES":
        if (value) result.images.push(value)
        break
      case "VOLUMES":
        if (value) result.volumes.push(value)
        break
      case "NETWORKS":
        if (value) result.networks.push(value)
        break
      case "RUNTIMES": {
        if (!value) break
        const [name, version] = value.split("|")
        result.runtimes.push({ name, version: version || "" })
        break
      }
      case "SERVICES": {
        if (!value) break
        const [unit, state] = value.split("|")
        result.systemdServices.push({ unit, state: state || "" })
        break
      }
      case "PG":
        result.postgres = value || "Unknown"
        break
      case "REDIS":
        result.redis = value || "Unknown"
        break
      case "NGINX":
        result.nginx = value || "Unknown"
        break
      case "CADDY":
        result.caddy = value || "Unknown"
        break
      case "DOMAINS":
        if (value) result.domains.push(value)
        break
      case "GIT_REPO":
        result.git.repoPath = value || null
        break
      case "GIT_BRANCH":
        result.git.branch = value || null
        break
      case "GIT_COMMIT":
        result.git.commit = value || null
        break
      case "GIT_REMOTE":
        result.git.remote = value || null
        break
    }
  }

  return result
}

/** Parses a git remote URL into { owner, name }, for any common remote form. Pure. */
export function gitRepoFromRemote(
  url: string | null
): { owner: string; name: string } | null {
  if (!url) return null
  const clean = url.trim().replace(/\.git$/, "")

  const ssh = clean.match(/^[^@]+@[^:]+:(.+)$/)
  if (ssh) {
    const [owner, name] = ssh[1]!.split("/")
    return owner && name ? { owner, name } : null
  }

  const https = clean.match(/(?:https?|git):\/\/[^/]+\/([^/]+)\/(.+)$/)
  if (https && https[1] && https[2]) return { owner: https[1]!, name: https[2]! }

  const bare = clean.match(/^([^/]+)\/([^/]+)$/)
  if (bare && bare[1] && bare[2]) return { owner: bare[1]!, name: bare[2]! }

  return null
}

/** Major version from a version string, e.g. "20.11.1" -> "20". Pure. */
export function majorVersion(value: string | null): string | null {
  if (!value) return null
  const match = value.match(/(\d+)/)
  return match ? match[1] : null
}
