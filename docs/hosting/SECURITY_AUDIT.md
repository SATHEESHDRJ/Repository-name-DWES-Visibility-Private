# DWES Security Audit (Pre-Deployment, Provider-Neutral)

**Date: 2026-07-13.** Scope: application + repository security posture relevant to internet exposure. Method: direct code inspection (file:line evidence). Cross-references the prior independent audit `docs/SECOND-REVIEW.md` (0 criticals after fixes) and `docs/oci-audit/SECURITY-NETWORK-AUDIT.md` (network controls, OCI-specific).

> **No system is 100% secure.** This audit establishes a defence-in-depth baseline and names the residual risks explicitly (§4). Anyone claiming otherwise is selling something.

## 1. Controls already implemented (verified — do NOT redo)

| Control | Evidence |
|---|---|
| JWT auth (Passport), Bearer extraction, expiry enforced, DB re-check of `is_active` per request | `backend/src/auth/strategies/jwt.strategy.ts` |
| Refresh-token **rotation**, stored **SHA-256-hashed** in SQLite, revoke-on-rotate + revoke-all-for-user | `backend/src/auth/auth-token-store.service.ts:20,35` |
| Password hashing: bcrypt (cost 10) | `auth.service.ts:113`, `main.ts:131` |
| WebAuthn passkeys (phishing-resistant 2nd path) | `backend/src/auth/webauthn.*` |
| Production **hard assert** on `JWT_SECRET` | `main.ts:79-83`, `auth.module.ts:14-20` |
| RBAC: `@Roles` + `RolesGuard` on JWT-populated user | `backend/src/common/guards/roles.guard.ts` |
| Technician IDOR protection on frames/drawings/cables/reports (assignment re-checked per request, incl. file streams) | `frames.controller.ts:243-300,362-375` |
| Files served **only** via guarded controllers — zero static exposure of `uploads/` | `main.ts` (no ServeStatic), `frames.controller.ts` |
| Upload validation: extension+MIME allow-lists, **magic-byte signature checks**, 50 MB cap, SHA-256 recorded | `upload.service.ts:24-112`, `upload.module.ts:7` |
| helmet enabled (CSP/COEP consciously off — see gaps) | `main.ts:167-171` |
| Rate limiting: global 120 req/60 s + login 10/60 s + refresh 20/60 s | `app.module.ts:21-25,41`, `auth.controller.ts:21,37` |
| CORS allow-list via `CORS_ORIGINS` in production | `main.ts:176-181` |
| Secrets hygiene: no tracked `.env`/keys (verified `git ls-files` + `check-ignore`); templates only; prior audit: “No committed secrets… Critical count after fixes: 0” | `.gitignore`, `docs/SECOND-REVIEW.md` |
| DEMO_MODE gating of login-hints/env endpoints; seeding disabled in production | `auth.service.ts:159-172`, `main.ts` |
| Audit trails: `session_log` (logins + destructive ops) + `tech_audit_log` | `backend/prisma/schema.prisma` |
| nginx reference config: TLS 1.2/1.3, HTTP→HTTPS 301, security headers, rate-limit zones, 55 MB body cap | `infra/nginx/conf.d/dwes.conf` |

## 2. Gaps (must fix before/at go-live — ordered by severity)

| # | Gap | Impact | Evidence |
|---|---|---|---|
| G1 | **No input validation anywhere**: no global `ValidationPipe`, zero DTO classes, controller bodies are untyped `any` (class-validator installed but unused) | Malformed/malicious payloads reach services unchecked — injection-adjacent risk, crash vectors, type-confusion | verified repo-wide grep; `projects.controller.ts:23,27` |
| G2 | **Demo seed passwords + dev-fallback JWT secret literals in source** (prod path gates them off, but rotation before exposure is mandatory) | Credential guessing if any seed account survives to prod | `main.ts:16-23`, `jwt.strategy.ts:20`, flagged in `PROJECT_STATUS.md:222` |
| G3 | **`GET /api/projects`, `/api/projects/:code`, `/api/projects/:code/stats` have no role scoping** — any authenticated user (incl. technicians) can enumerate all projects' metadata | Metadata-level over-exposure (client names, project codes, progress) — not file-level IDOR, but real confidentiality leak | `projects.controller.ts:16,19,78` |
| G4 | **CSP disabled** + tokens in `localStorage` | XSS ⇒ token theft; CSP is the mitigation layer and it's off | `main.ts:169`, `src/services/api.ts:10-27` |
| G5 | **`dwes_auth.sqlite` excluded from BOTH backup systems** | Disaster loses all passkeys + refresh tokens | `scripts/BACKUP.md:69`, `infra/oci/scripts/backup-oci.sh` |
| G6 | No explicit JSON body-size limit (only the 50 MB multipart cap) | Memory-pressure DoS via huge JSON bodies | `main.ts` (no bodyParser limit) |
| G7 | No refresh-token expiry purge or reuse detection | Stale rows accumulate; a stolen-then-rotated token isn't flagged as breach | `auth-token-store.service.ts` |
| G8 | Dev CORS fallback includes whole private-LAN regexes — safe only if `NODE_ENV=production` + `CORS_ORIGINS` are guaranteed set in prod | Over-broad origins if misconfigured | `main.ts:57-61` |
| G9 | Domain spelling inconsistent: `dwes.ingenious-network.com` (canonical) vs `dwes.ingeniousnetwork.com` in templates | Cert/CORS/WebAuthn (RP_ID!) breakage if the wrong one is deployed | `deploy-secrets.local.env.example:5` vs `CHANGELOG.md:86` |
| G10 | No malware scanning of uploads | Malicious PDF/Office file distributed to other users via the app | mitigated by signature checks + no server execution; see residual risks |

## 3. Fix plan
See `SECURITY_IMPLEMENTATION_PLAN.md` — ordered, effort-estimated, split into platform-conditional branches. None of these fixes have been applied in this assessment (docs-only task).

## 4. Residual risks (accepted and documented — revisit quarterly)

1. **XSS window until G1+G4 land**, and even after: localStorage tokens remain readable by successful XSS. Full mitigation (httpOnly cookie tokens) is a larger refactor — logged as future work, not go-live-blocking at this user count.
2. **Malware in uploaded files** (G10): signature checks stop masquerading, not weaponized-but-valid files. Accepted at current scale (all uploaders are authenticated, known employees; downloads are `Content-Disposition` attachments). Practical upgrade path: async ClamAV scan.
3. **Single-region deployments** (all low-cost options): a regional outage takes DWES down until restore-elsewhere (RTO applies). Accepted vs cost.
4. **Free-tier dependencies** (Neon/R2 in Option C): terms can change (2025-26 showed free tiers shrinking industry-wide). Mitigation: portability by design + `PROVIDER_MIGRATION_GUIDE.md` + billing alerts.
5. **Platform trust**: on managed hosts, provider staff/compromise is in the threat model; DB TLS + hashed credentials + no-secrets-in-git bound the blast radius but can't remove it.
6. **Human factor**: one administrator, learning ops. The runbooks reduce but cannot remove mis-operation risk; the FINAL_DEPLOYMENT_CHECKLIST forbids production cutover until backup restoration has been *tested*, not assumed.
