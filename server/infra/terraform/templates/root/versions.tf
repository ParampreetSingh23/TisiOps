terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Filled in per deployment by the worker via `terraform init -backend-config`,
  # or removed entirely for local development state.
  backend "s3" {}
}
