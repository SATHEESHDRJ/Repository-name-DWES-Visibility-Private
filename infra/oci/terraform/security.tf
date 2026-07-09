# Custom security list — HTTP/HTTPS only; SSH via Bastion (no public 22)
resource "oci_core_security_list" "dwes_public_sl" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.dwes_vcn.id
  display_name   = "${var.project_name}-public-sl"

  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 80
      max = 80
    }
  }

  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 443
      max = 443
    }
  }

  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }
}

resource "oci_bastion_bastion" "dwes_bastion" {
  compartment_id               = var.compartment_id
  bastion_type                 = "STANDARD"
  target_subnet_id             = oci_core_subnet.dwes_public_subnet.id
  client_cidr_block_allow_list = var.bastion_client_cidr_allow_list
  max_session_ttl_in_seconds   = 10800
  name                         = "${var.project_name}-bastion"
}

resource "oci_kms_vault" "dwes_vault" {
  compartment_id = var.compartment_id
  display_name   = "${var.project_name}-vault"
  vault_type     = "DEFAULT"
}

resource "oci_ons_notification_topic" "dwes_alerts" {
  compartment_id = var.compartment_id
  name           = "${var.project_name}-alerts"
}

resource "oci_monitoring_alarm" "dwes_cpu_high" {
  compartment_id        = var.compartment_id
  display_name          = "${var.project_name}-cpu-high"
  is_enabled            = true
  metric_compartment_id = var.compartment_id
  namespace             = "oci_computeagent"
  query                 = "CpuUtilization[1m]{resourceId = \"${oci_core_instance.dwes_app.id}\"}.mean() > 80"
  severity              = "CRITICAL"
  destinations          = [oci_ons_notification_topic.dwes_alerts.id]
  pending_duration      = "PT5M"
  body                  = "DWES VM CPU > 80%"
  repeat_notification_duration = "PT1H"
}
