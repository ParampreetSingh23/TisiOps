# One PostgreSQL server: security group, instance, and a stable address.
#
# A fixed, tested module. TisiOps generates a terraform.tfvars.json per
# deployment and never generates or edits Terraform itself, so an AI-suggested
# value can only ever land in a variable the validator already approved.
#
# Infrastructure only. Installing Docker and PostgreSQL is the bootstrap
# service's job.

locals {
  name = "tisiops-${var.project_name}-${substr(var.deployment_id, 0, 8)}"

  tags = merge(
    {
      Name        = local.name
      ManagedBy   = "tisiops"
      Template    = "aws-postgres-server"
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

resource "aws_security_group" "postgres" {
  name        = local.name
  description = "TisiOps managed PostgreSQL server"
  vpc_id      = data.aws_vpc.default.id
  tags        = local.tags

  ingress {
    description = "PostgreSQL public MVP"
    from_port   = var.app_port
    to_port     = var.app_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

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
resource "aws_key_pair" "postgres" {
  count      = var.ssh_public_key == "" ? 0 : 1
  key_name   = local.name
  public_key = var.ssh_public_key
  tags       = local.tags
}

resource "aws_instance" "postgres" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.postgres.id]
  key_name               = var.ssh_public_key == "" ? null : aws_key_pair.postgres[0].key_name
  user_data              = var.cloud_init
  tags                   = local.tags

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

resource "aws_eip" "postgres" {
  domain = "vpc"
  tags   = local.tags
}

resource "aws_eip_association" "postgres" {
  instance_id   = aws_instance.postgres.id
  allocation_id = aws_eip.postgres.id
}
