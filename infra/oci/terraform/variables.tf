variable "region" {
  type        = string
  description = "OCI region — use me-dubai-1 for UAE (Sharjah) primary"
  default     = "me-dubai-1"
}

variable "compartment_id" {
  type        = string
  description = "OCI compartment OCID"
}

variable "object_storage_namespace" {
  type        = string
  description = "Tenancy object storage namespace"
}

variable "project_name" {
  type    = string
  default = "dwes"
}

variable "vcn_cidr" {
  type    = string
  default = "10.10.0.0/16"
}

variable "public_subnet_cidr" {
  type    = string
  default = "10.10.1.0/24"
}

variable "ssh_public_key" {
  type        = string
  description = "SSH public key for app VM (use OCI Bastion in production)"
}

variable "app_ocpus" {
  type    = number
  default = 2
}

variable "app_memory_gb" {
  type    = number
  default = 12
}

variable "data_volume_gb" {
  type    = number
  default = 100
}

variable "bastion_client_cidr_allow_list" {
  type        = list(string)
  description = "CIDR blocks allowed to open Bastion sessions (your office/home IP)"
  default     = ["0.0.0.0/0"]
}

variable "alert_email" {
  type        = string
  description = "Email for OCI Notifications subscription (configure manually after apply)"
  default     = ""
}

variable "availability_domain_index" {
  type        = number
  description = "Index into region AD list — go-live script retries 0..2 on A1 capacity errors"
  default     = 0
}
