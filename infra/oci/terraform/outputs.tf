output "app_public_ip" {
  value       = oci_core_instance.dwes_app.public_ip
  description = "Point DNS A record here"
}

output "backup_bucket" {
  value = oci_objectstorage_bucket.dwes_backups.name
}

output "vcn_id" {
  value = oci_core_vcn.dwes_vcn.id
}

output "bastion_id" {
  value       = oci_bastion_bastion.dwes_bastion.id
  description = "Use for SSH sessions — no public port 22"
}

output "vault_id" {
  value = oci_kms_vault.dwes_vault.id
}

output "notification_topic_id" {
  value = oci_ons_notification_topic.dwes_alerts.id
}
