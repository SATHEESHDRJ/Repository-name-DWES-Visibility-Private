# DWES load test (k6)

## Target

- **120 concurrent virtual users** for 2 minutes
- **p95 latency < 800 ms** on `/healthz` and `/api/health`

## One command

```bash
# Local E2E stack (HTTP)
npm run load:smoke

# Production (HTTPS)
npm run load:smoke -- https://dwes.ingeniousnetwork.com

# Or directly:
bash scripts/k6-smoke.sh https://your-domain.example
k6 run -e DWES_BASE_URL=https://your-domain.example infra/load/k6/smoke-120vus.js
```

## Prerequisites

Install [k6](https://k6.io/docs/get-started/installation/).

For self-signed or local HTTP targets, `K6_INSECURE_SKIP_TLS_VERIFY=true` is set by `scripts/k6-smoke.sh`.

## Local E2E stack first

```bash
node scripts/e2e-stack.mjs up
npm run load:smoke
node scripts/e2e-stack.mjs down
```

## If p95 fails on 2 OCPU / 12 GB

1. Edit `infra/oci/terraform/terraform.tfvars`:
   - `app_ocpus = 4`
   - `app_memory_gb = 24`
2. `terraform apply` (single variable change; ~15 min)
3. Re-run k6

No schema or application changes required.

## Scale tier

If sustained load exceeds 150 concurrent users, enable `infra/oci/terraform/modules/scale-tier/` (LB + WAF + 2nd VM).
