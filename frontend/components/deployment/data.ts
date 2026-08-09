/** ponytail: mock data for the deployment wizard. Replace with real sources per step. */

export const STEPS = [
  "Choose Provider",
  "Connect Provider",
  "Select Repository",
  "AI Analysis",
  "AI Questions",
  "Recommended Config",
  "Review Plan",
  "Deployment Status",
] as const

export type Field = {
  name: string
  label: string
  placeholder: string
  type?: string
}

/** AWS has a real form now — see components/deployment/aws-connect.tsx. */
export const VPS_FIELDS: Field[] = [
  { name: "serverIp", label: "Server IP", placeholder: "203.0.113.10" },
  { name: "sshUser", label: "SSH Username", placeholder: "root" },
  { name: "sshPort", label: "SSH Port", placeholder: "22" },
  { name: "os", label: "Operating System", placeholder: "Ubuntu 24.04" },
]

export const REPOSITORIES = [
  { name: "portfolio-nextjs", framework: "Next.js", branch: "main" },
  { name: "api-server", framework: "Node.js", branch: "main" },
  { name: "client-dashboard", framework: "React", branch: "develop" },
]

export const ANALYSIS = [
  { label: "Framework", value: "Next.js" },
  { label: "Runtime", value: "Node.js" },
  { label: "Package Manager", value: "npm" },
  { label: "Build Command", value: "npm run build" },
  { label: "Start Command", value: "npm start" },
  { label: "App Port", value: "3000" },
  { label: "Dockerfile", value: "Not found" },
  { label: "Environment Variables", value: "Required" },
]

export const QUESTIONS = [
  {
    id: "target",
    question: "What is the deployment target?",
    options: ["Development", "Staging", "Production"],
  },
  {
    id: "users",
    question: "How many users do you expect?",
    options: ["Less than 100", "100–1,000", "1,000–10,000", "More than 10,000"],
  },
  {
    id: "budget",
    question: "What is your budget preference?",
    options: ["Cheapest possible", "Balanced", "Performance focused"],
  },
  {
    id: "region",
    question: "Which region should the app be closest to?",
    options: ["India", "Europe", "United States", "Global"],
  },
  {
    id: "database",
    question: "Does this app need a database?",
    options: ["No database", "PostgreSQL", "MySQL", "MongoDB", "Redis"],
  },
  {
    id: "domain",
    question: "Do you have a domain?",
    options: ["Yes", "No", "Add later"],
  },
]

export const RECOMMENDED_CONFIG = [
  { label: "Provider", value: "AWS" },
  { label: "Region", value: "ap-south-1 Mumbai" },
  { label: "Server", value: "2 vCPU / 2 GB RAM" },
  { label: "OS", value: "Ubuntu" },
  { label: "Runtime", value: "Docker" },
  { label: "Reverse Proxy", value: "Caddy" },
  { label: "SSL", value: "Auto HTTPS" },
  { label: "Estimated Cost", value: "Low" },
]

export const PLAN_STEPS = [
  "Connect to the selected cloud provider",
  "Prepare the server environment",
  "Install Docker and required dependencies",
  "Clone the selected GitHub repository",
  "Detect framework and runtime",
  "Install application dependencies",
  "Build the application",
  "Create Docker configuration if missing",
  "Configure reverse proxy",
  "Map app port 3000",
  "Enable HTTPS later",
  "Run health check",
  "Start log monitoring",
]
