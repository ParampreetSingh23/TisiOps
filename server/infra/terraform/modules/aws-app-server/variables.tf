variable "deployment_id" {
  description = "TisiOps deployment id. Tags every resource so a run can be traced back."
  type        = string
}

variable "project_name" {
  description = "Safe, lowercase name used in resource names and tags."
  type        = string
}

variable "aws_region" {
  description = "AWS region. Restricted to the template's allowlist before Terraform runs."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type, checked against the template's allowlist."
  type        = string
}

variable "volume_size" {
  description = "Root EBS volume in GB. The application and its data live here."
  type        = number
  default     = 20
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to reach port 22. Defaults to a closed range: the server is configured by cloud-init, so nothing signs in."
  type        = string
  default     = "127.0.0.1/32"
}

variable "http_port" {
  description = "Port Caddy answers on for the redirect and certificate validation."
  type        = number
  default     = 80
}

variable "https_port" {
  description = "Port Caddy serves the application on."
  type        = number
  default     = 443
}

variable "app_port" {
  description = "Port the application listens on inside the instance, behind the proxy. Not exposed to the internet."
  type        = number
  default     = 3000
}

variable "environment" {
  description = "preview, staging, or production. Tag only — it changes no infrastructure."
  type        = string
  default     = "preview"
}

variable "tags" {
  description = "Tags applied to every resource, merged over the module's own."
  type        = map(string)
  default     = {}
}

variable "cloud_init" {
  description = "First-boot script. Kept minimal: the worker configures the server over SSH afterwards, so this only prepares the machine to be configured."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ssh_public_key" {
  description = "Public half of the per-deployment provisioning key. Empty means no key pair is created and the worker cannot log in."
  type        = string
  default     = ""
}
