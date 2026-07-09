terraform {
  required_version = ">= 1.5.0"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 5.0"
    }
  }
}

provider "oci" {
  region = var.region
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_id
}

data "oci_core_images" "ubuntu_arm" {
  compartment_id           = var.compartment_id
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_vcn" "dwes_vcn" {
  compartment_id = var.compartment_id
  cidr_blocks    = [var.vcn_cidr]
  display_name   = "${var.project_name}-vcn"
  dns_label      = "dwesvcn"
}

resource "oci_core_internet_gateway" "dwes_igw" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.dwes_vcn.id
  display_name   = "${var.project_name}-igw"
  enabled        = true
}

resource "oci_core_route_table" "dwes_public_rt" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.dwes_vcn.id
  display_name   = "${var.project_name}-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.dwes_igw.id
  }
}

resource "oci_core_subnet" "dwes_public_subnet" {
  compartment_id             = var.compartment_id
  vcn_id                     = oci_core_vcn.dwes_vcn.id
  cidr_block                 = var.public_subnet_cidr
  display_name               = "${var.project_name}-public"
  dns_label                  = "dwespub"
  prohibit_public_ip_on_vnic = false
  route_table_id             = oci_core_route_table.dwes_public_rt.id
  security_list_ids          = [oci_core_security_list.dwes_public_sl.id]
}

resource "oci_core_network_security_group" "dwes_nsg" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.dwes_vcn.id
  display_name   = "${var.project_name}-nsg"
}

resource "oci_core_network_security_group_security_rule" "dwes_ingress_https" {
  network_security_group_id = oci_core_network_security_group.dwes_nsg.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range { min = 443 max = 443 }
  }
}

resource "oci_core_network_security_group_security_rule" "dwes_ingress_http" {
  network_security_group_id = oci_core_network_security_group.dwes_nsg.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range { min = 80 max = 80 }
  }
}

resource "oci_core_network_security_group_security_rule" "dwes_egress_all" {
  network_security_group_id = oci_core_network_security_group.dwes_nsg.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
}

resource "oci_core_volume" "dwes_data" {
  compartment_id = var.compartment_id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name   = "${var.project_name}-data"
  size_in_gbs    = var.data_volume_gb
}

resource "oci_core_instance" "dwes_app" {
  compartment_id      = var.compartment_id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = "${var.project_name}-app"
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = var.app_ocpus
    memory_in_gbs = var.app_memory_gb
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu_arm.images[0].id
  }

  create_vnic_details {
    subnet_id                 = oci_core_subnet.dwes_public_subnet.id
    assign_public_ip          = true
    nsg_ids                   = [oci_core_network_security_group.dwes_nsg.id]
    display_name              = "${var.project_name}-vnic"
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data           = base64encode(templatefile("${path.module}/cloud-init.yaml", {
      project_name = var.project_name
    }))
  }
}

resource "oci_core_volume_attachment" "dwes_data_attach" {
  attachment_type = "paravirtualized"
  compartment_id    = var.compartment_id
  instance_id       = oci_core_instance.dwes_app.id
  volume_id         = oci_core_volume.dwes_data.id
}

resource "oci_objectstorage_bucket" "dwes_backups" {
  compartment_id = var.compartment_id
  namespace      = var.object_storage_namespace
  name           = "${var.project_name}-backups"
  access_type    = "NoPublicAccess"
  versioning     = "Enabled"
}
