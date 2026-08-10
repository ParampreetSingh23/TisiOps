# One n8n server: security group, instance, and a stable address for it.
#
# A fixed, tested module. TisiOps generates a terraform.tfvars.json per
# deployment and never generates or edits Terraform itself, so an AI-suggested
# value can only ever land in a variable the validator already approved.
#
# Infrastructure only. Installing Docker, Postgres, n8n, and Caddy is the
# bootstrap service's job — see services/bootstrap/n8nBootstrap.service.ts.

locals {
  name = "tisiops-${var.project_name}-${substr(var.deployment_id, 0, 8)}"

  tags = merge(
    {
      Name        = local.name
      ManagedBy   = "tisiops"
      Template    = "aws-n8n-server"
      Environment = var.environment
    },
    var.tags
  )
}

data "aws_vpc" "default" {
  default = true
}

# Ubuntu 24.04 LTS, owned by Canonical. Looked up rather than hardcoded because
# AMI ids differ per region and are replaced on every image release.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "n8n" {
  name        = local.name
  description = "TisiOps managed n8n server"
  vpc_id      = data.aws_vpc.default.id
  tags        = local.tags

  # Caddy terminates TLS and answers HTTP for the ACME challenge and redirect,
  # so both have to be reachable from the internet.
  ingress {
    description = "HTTP"
    from_port   = var.http_port
    to_port     = var.http_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = var.https_port
    to_port     = var.https_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Scoped to whatever the validator approved, which defaults to a closed
  # range. The application port is deliberately absent: n8n is only reachable
  # through Caddy, never directly.
  ingress {
    description = "SSH (provisioning)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Provisioning key pair, created only when a public key is supplied. One key
# per deployment: a key that opened every TisiOps server would be a single
# point of total compromise.
resource "aws_key_pair" "n8n" {
  count      = var.ssh_public_key == "" ? 0 : 1
  key_name   = local.name
  public_key = var.ssh_public_key
  tags       = local.tags
}

resource "aws_instance" "n8n" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.n8n.id]
  key_name               = var.ssh_public_key == "" ? null : aws_key_pair.n8n[0].key_name
  user_data              = var.cloud_init
  tags                   = local.tags

  # user_data carries the n8n encryption key and database password. IMDSv2 is
  # required so a request-forgery bug in a workflow cannot read them back out
  # of the metadata service with a plain GET.
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_size = var.volume_size
    volume_type = "gp3"
    encrypted   = true
  }
}

# A released instance address would change on every stop/start, which breaks
# both the user's DNS record and every webhook already registered in n8n.
resource "aws_eip" "n8n" {
  domain = "vpc"
  tags   = local.tags
}

resource "aws_eip_association" "n8n" {
  instance_id   = aws_instance.n8n.id
  allocation_id = aws_eip.n8n.id
}
