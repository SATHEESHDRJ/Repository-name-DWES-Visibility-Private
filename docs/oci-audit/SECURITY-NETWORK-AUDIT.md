# OCI security & networking audit (DWES single-VM)

**Branch:** `change/oci-single-vm-prod-2026-07-09`  
**Region:** `me-dubai-1`  
**Date:** 2026-07-09

## Network

| Control | Implementation | Status |
|---------|----------------|--------|
| Public ingress | HTTP 80 + HTTPS 443 only (`security.tf` security list + NSG) | Ready |
| SSH | OCI Bastion sessions only; no public port 22 | Ready |
| DB exposure | Postgres on Docker internal network only | Ready |
| TLS | Let's Encrypt via certbot; sync to nginx ssl mount | Fixed (renew path) |

## Application security

| Control | Status |
|---------|--------|
| `login-hints` 404 when `DEMO_MODE=false` | Done |
| `/api/env` minimal in production | Done |
| Startup seed skipped in production | Done |
| Deep `/api/health` with `SELECT 1` | Done |
| JWT access + refresh rotation | Done |
| Throttler + helmet | Done |
| Production bootstrap (password + WebAuthn) API + UI gate | Done |

## Deploy pipeline

| Control | Status |
|---------|--------|
| OCIR image push on tag | Done |
| Deploy via Bastion (not direct public SSH) | Fixed |
| Secrets not in git (pre-commit hook) | Done |

## Human verification required

- WebAuthn on live HTTPS domain (Sharjah + Chennai devices)
- k6 p95 on production URL
- ONS notification subscription for CPU alarm topic

See [HUMAN-ACTIONS.md](../HUMAN-ACTIONS.md).
