output "instance_id" {
  description = "EC2 instance id."
  value       = aws_instance.app.id
}

output "public_ip" {
  description = "Address assigned at launch, before the Elastic IP is associated."
  value       = aws_instance.app.public_ip
}

output "elastic_ip" {
  description = "The stable address. This is what a DNS A record must point at."
  value       = aws_eip.app.public_ip
}

output "security_group_id" {
  description = "Security group protecting the instance."
  value       = aws_security_group.app.id
}

output "region" {
  description = "Region the instance runs in."
  value       = var.aws_region
}

output "instance_type" {
  description = "Instance type actually launched."
  value       = aws_instance.app.instance_type
}

output "key_name" {
  description = "Provisioning key pair, empty when none was created."
  value       = var.ssh_public_key == "" ? "" : aws_key_pair.app[0].key_name
}

output "ssh_username" {
  description = "Default login for the Ubuntu AMI. Recorded for operators; nothing in TisiOps logs in."
  value       = "ubuntu"
}
