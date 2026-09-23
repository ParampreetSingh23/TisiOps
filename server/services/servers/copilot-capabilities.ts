/**
 * The only operations Server Copilot can name. Keep command construction out
 * of this module: workers and inspectors select fixed scripts by this id.
 */
export type ServerCapabilityRisk = "READ_ONLY" | "EXECUTION" | "DESTRUCTIVE"

export const SERVER_CAPABILITIES = {
  SERVER_HEALTH: { risk: "READ_ONLY", label: "Check server health" },
  DISK_USAGE: { risk: "READ_ONLY", label: "Check disk usage" },
  MEMORY_USAGE: { risk: "READ_ONLY", label: "Check memory usage" },
  CPU_USAGE: { risk: "READ_ONLY", label: "Check CPU usage" },
  LIST_CONTAINERS: { risk: "READ_ONLY", label: "List containers" },
  CONTAINER_STATUS: { risk: "READ_ONLY", label: "Check container status" },
  CONTAINER_LOGS: { risk: "READ_ONLY", label: "Read recent container logs" },
  SERVICE_STATUS: { risk: "READ_ONLY", label: "Check service status" },
  SERVICE_LOGS: { risk: "READ_ONLY", label: "Read recent service logs" },
  LIST_PORTS: { risk: "READ_ONLY", label: "List listening ports" },
  GIT_STATUS: { risk: "READ_ONLY", label: "Check Git status" },
  NGINX_STATUS: { risk: "READ_ONLY", label: "Check Nginx" },
  CADDY_STATUS: { risk: "READ_ONLY", label: "Check Caddy" },
  INSTALL_DOCKER: { risk: "EXECUTION", label: "Install Docker" },
  INSTALL_APACHE: { risk: "EXECUTION", label: "Install Apache HTTP Server" },
  INSTALL_GIT: { risk: "EXECUTION", label: "Install Git" },
  CLONE_REPOSITORY: { risk: "EXECUTION", label: "Clone repository" },
  CHECKOUT_BRANCH: { risk: "EXECUTION", label: "Check out branch" },
  DEPLOY_DOCKER_APP: { risk: "EXECUTION", label: "Deploy Docker app" },
  DEPLOY_DOCKER_COMPOSE: { risk: "EXECUTION", label: "Deploy Docker Compose app" },
  CONFIGURE_NGINX_PROXY: { risk: "EXECUTION", label: "Configure Nginx proxy" },
  CONFIGURE_CADDY_PROXY: { risk: "EXECUTION", label: "Configure Caddy proxy" },
  RESTART_CONTAINER: { risk: "EXECUTION", label: "Restart container" },
  RESTART_SUPPORTED_SERVICE: { risk: "EXECUTION", label: "Restart supported service" },
  DEPLOY_POSTGRES: { risk: "EXECUTION", label: "Deploy PostgreSQL" },
  DEPLOY_REDIS: { risk: "EXECUTION", label: "Deploy Redis" },
} as const satisfies Record<string, { risk: ServerCapabilityRisk; label: string }>

export type ServerCapability = keyof typeof SERVER_CAPABILITIES

export function isServerCapability(value: string): value is ServerCapability {
  return value in SERVER_CAPABILITIES
}

/** Intent selects an allowlisted capability only; it never becomes shell. */
export function capabilityForCopilotMessage(message: string): ServerCapability | null {
  const text = message.toLowerCase().trim()
  if (/install\s+docker/.test(text)) return "INSTALL_DOCKER"
  if (/install\s+apache2?/.test(text)) return "INSTALL_APACHE"
  if (/install\s+git/.test(text)) return "INSTALL_GIT"
  if (/docker|containers?/.test(text) && /logs?|errors?/.test(text)) return "CONTAINER_LOGS"
  if (/docker|containers?/.test(text)) return "LIST_CONTAINERS"
  if (/disk|storage|space/.test(text)) return "DISK_USAGE"
  if (/memory|ram/.test(text)) return "MEMORY_USAGE"
  if (/cpu|load/.test(text)) return "CPU_USAGE"
  if (/ports?|listen/.test(text)) return "LIST_PORTS"
  if (/nginx/.test(text)) return "NGINX_STATUS"
  if (/caddy/.test(text)) return "CADDY_STATUS"
  if (/service/.test(text)) return "SERVICE_STATUS"
  if (/git|repository/.test(text)) return "GIT_STATUS"
  if (/health|status|down|diagnos/.test(text)) return "SERVER_HEALTH"
  return null
}

/** A Docker name is data only after this strict check; it can never become a shell fragment. */
export function containerNameForCopilotMessage(message: string): string | null {
  if (/[;&|`$<>]/.test(message)) return null
  const match = message.toLowerCase().match(/(?:docker\s+)?logs?\s+(?:of|for|from)?\s*(?:the\s+)?([a-z0-9][a-z0-9_.-]{0,127})(?:\s+container)?\b/)
  return match?.[1] ?? null
}
