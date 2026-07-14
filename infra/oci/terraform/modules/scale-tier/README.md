# Scale tier (disabled at launch)

Enable when **concurrent users exceed 150** or HA is required:

> Prerequisite: replace the API's in-process SSE event bus with Redis Pub/Sub or
> PostgreSQL `LISTEN/NOTIFY` before enabling multiple app nodes. Load-balancer
> stickiness does not propagate events between backend processes.

- OCI Load Balancer with health check on `/healthz`
- OCI WAF policy on the LB
- Second `VM.Standard.A1.Flex` app node
- Rolling deploy via `deploy.sh` per backend

Terraform module placeholder: add `module "scale_tier" { count = var.enable_scale_tier ? 1 : 0 }` when ready.

Until then: single VM, Nginx TLS, ~30s deploy blip acceptable.
