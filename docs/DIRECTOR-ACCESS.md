# Director remote access (Chennai)

The India-based **ops_director** uses DWES as an **application administrator only**. No infrastructure access.

## Allowed

| Access | How |
|--------|-----|
| DWES web app | `https://<DWES_DOMAIN>` over HTTPS |
| Fingerprint / WebAuthn login | Enroll after production bootstrap (password rotation first) |
| Director dashboard | Role `ops_director` from restored WiringSchemeDB |
| Audit trail | `session_log` records all logins |
| GitHub | Issues and pull requests on the DWES repository |

## Not allowed

| Access | Reason |
|--------|--------|
| SSH to OCI VM | Bastion sessions restricted to UAE ops / deploy automation |
| OCI Console (production compartment) | Least privilege — infra team only |
| PostgreSQL / `psql` | DB reachable only on Docker internal network |
| `backend/uploads` shell access | Files synced via controlled migration only |
| Terraform / `deploy.sh` | CI deploy on version tag; not director workstation |

## Latency

Chennai → `me-dubai-1` is typically **90–130 ms**. Acceptable for director reporting; no India region required at current user count.

## Bootstrap on first login

After data migration, directors must:

1. Sign in with restored password
2. Complete the **forced bootstrap modal** (change password, then WebAuthn)
3. Confirm `GET /api/auth/webauthn/config` shows correct `rpId`

See [DWES_ORACLE_CLOUD_DEPLOY_PROMPT.md](./DWES_ORACLE_CLOUD_DEPLOY_PROMPT.md).
