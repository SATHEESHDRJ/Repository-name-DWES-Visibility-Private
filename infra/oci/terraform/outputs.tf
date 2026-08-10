output "app_public_ip" {
  value       = oci_core_instance.dwes_app.public_ip
  description = "Point DNS A record here"
}

output "app_private_ip" {
  value       = data.oci_core_vnic.dwes_app_vnic.private_ip_address
  description = "GitHub secret OCI_VM_HOST (Bastion target)"
}

data "oci_core_vnic_attachments" "dwes_app_vnics" {
  compartment_id = var.compartment_id
  instance_id    = oci_core_instance.dwes_app.id
}

data "oci_core_vnic" "dwes_app_vnic" {
  vnic_id = data.oci_core_vnic_attachments.dwes_app_vnics.vnic_attachments[0].vnic_id
}

output "app_instance_id" {
  value       = oci_core_instance.dwes_app.id
  description = "GitHub secret OCI_VM_INSTANCE_ID"
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

output "vault_key_id" {
  value       = oci_kms_key.dwes_vault_key.id
  description = "KMS key for OCI Vault secrets (JWT, Postgres password)"
}

output "notification_topic_id" {
  value = oci_ons_notification_topic.dwes_alerts.id
}
