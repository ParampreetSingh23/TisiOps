# The per-deployment entry point.
#
# The worker copies this directory, writes terraform.tfvars.json beside it, and
# symlinks the module the registry named to ./module. One root works for every
# template because the variable interface is identical across modules — which
# is exactly what makes them interchangeable and testable.

provider "aws" {
  region = var.aws_region
}

module "server" {
  source = "./module"

  deployment_id    = var.deployment_id
  project_name     = var.project_name
  aws_region       = var.aws_region
  instance_type    = var.instance_type
  volume_size      = var.volume_size
  allowed_ssh_cidr = var.allowed_ssh_cidr
  http_port        = var.http_port
  https_port       = var.https_port
  app_port         = var.app_port
  environment      = var.environment
  tags             = var.tags
  cloud_init       = var.cloud_init
  ssh_public_key   = var.ssh_public_key
}

output "instance_id" { value = module.server.instance_id }
output "public_ip" { value = module.server.public_ip }
output "elastic_ip" { value = module.server.elastic_ip }
output "security_group_id" { value = module.server.security_group_id }
output "region" { value = module.server.region }
output "instance_type" { value = module.server.instance_type }
output "ssh_username" { value = module.server.ssh_username }
output "key_name" { value = module.server.key_name }
