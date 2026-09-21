# DWES load test (k6)

## Targets

| Scenario | Script | Concurrent VUs | Duration | Notes |
|----------|--------|----------------|----------|-------|
| Health smoke | `infra/load/k6/smoke-120vus.js` | 120 | 2m | `/healthz` + `/api/health` |
| **Technician sessions (≥70)** | `infra/load/k6/tech-70vus.js` | **70** | 3m | Login + panels + twin peek (local only) |

- Health smoke: **p95 latency < 800 ms**
- Tech 70: **p95 < 1200 ms**, `http_req_failed < 5%` (auth optional via `DWES_TECH_PASS`)

**Do not run against production** unless `DWES_ALLOW_PROD_LOAD=1` is explicitly set. Prefer `localhost` / E2E stack.

## One command

```bash
# Local E2E stack (HTTP) — health smoke
npm run load:smoke

# ≥70 concurrent technician-like sessions (localhost API default :3001)
npm run load:tech70
npm run load:tech70 -- http://localhost:18080
# With demo tech credentials (local DEMO_MODE only):
#   set DWES_TECH_USER=tech1
#   set DWES_TECH_PASS=<local-demo-password>
#   npm run load:tech70

# Or directly:
bash scripts/k6-smoke.sh https://your-domain.example
k6 run -e DWES_BASE_URL=http://localhost:3001 infra/load/k6/smoke-120vus.js
k6 run -e DWES_BASE_URL=http://localhost:3001 infra/load/k6/tech-70vus.js
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
