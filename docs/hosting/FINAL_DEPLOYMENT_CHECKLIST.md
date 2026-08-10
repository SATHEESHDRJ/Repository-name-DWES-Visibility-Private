# DWES Final Deployment Checklist (Gated)

**Date: 2026-07-13.** The project is **not cloud-ready** until every box is checked in order. Gate 0 blocks everything: nothing may be provisioned, no DNS changed, no data migrated, no GitHub secrets modified, no local data deleted before it passes.

## Gate 0 — Approval (BLOCKING — currently open)
- [ ] User has reviewed `RECOMMENDED_ARCHITECTURE.md` and approved one option (A/B/C/D) in writing
- [ ] Business assumptions confirmed: uptime ~99%, RPO ≤24 h, RTO ≤4 h, retention 30 d (`HOSTING_REQUIREMENTS.md`)
- [ ] Budget for the chosen option acknowledged (`BILLING_AND_COST_CONTROL.md`)
- [ ] `/api` routing decision made: Worker proxy (no code change) vs configurable base URL (code change)

## Gate 1 — Code readiness (repo work, before any cloud account)
- [ ] `SECURITY_IMPLEMENTATION_PLAN.md` Phase S1 complete: S1.1 seed/JWT-literal rotation · S1.2 ValidationPipe+DTOs · S1.3 projects RBAC · S1.4 JSON body limit · S1.5 domain-spelling reconciliation · S1.6 sqlite in backup set
- [ ] CI green on `main`; both Docker images build
- [ ] GitHub origin created (private), pushed, secret scanning + push protection on
- [ ] Full local backup taken (`npm run backup`) and verified

## Gate 2 — Accounts & billing safety
- [ ] Provider accounts created with **2FA** (Cloudflare, + per chosen option: Railway/Neon/…)
- [ ] Usage limits + billing alerts configured per `BILLING_AND_COST_CONTROL.md` §3 — **before** first deploy
- [ ] Secrets entered only in provider dashboards; names match the inventory; nothing in Git/chat/logs

## Gate 3 — DNS foundation (no cutover yet)
- [ ] Turbify record inventory exported (`DNS_AND_SSL_GUIDE.md` §3.1)
- [ ] Nameservers moved to Cloudflare; all pre-existing records verified (especially MX/email)
- [ ] Existing services confirmed unaffected after 48 h

## Gate 4 — Deploy (no production traffic)
- [ ] Database migrated + **row counts verified** (`DATABASE_MIGRATION_GUIDE.md`)
- [ ] API deployed with volumes mounted; `/api/health` deep-check green
- [ ] Frontend deployed; Worker route (or CORS config) working on a temp/preview URL
- [ ] Uploads copied; spot-check one file per project per kind
- [ ] Role smoke tests: admin, director, supervisor, QA, technician — login, project view, assignment scoping (technician blocked from foreign project = expected 403), drawing view, report generation, 50 MB upload
- [ ] Passkey enrollment + login on the real domain
- [ ] TLS: padlock valid, HTTP→HTTPS redirect, SSL Labs grade ≥ A

## Gate 5 — Protection proven (the one people skip — we don't)
- [ ] Nightly backup job ran ≥2 consecutive nights to R2 (all three artifacts + manifest)
- [ ] **Full restore drill passed**: DB dump → scratch DB; uploads tarball → scratch volume; sqlite → passkey login works (`BACKUP_AND_RESTORE_RUNBOOK.md` drill log filled in)
- [ ] Monitoring live: uptime check on `/api/health`, backup heartbeat, certificate-expiry alerts, billing alerts test-fired
- [ ] Incident runbook read once end-to-end by the administrator (30 min)

## Gate 6 — Cutover
- [ ] TTL lowered to 300 s ≥1 day prior; team informed of the window
- [ ] DNS switched; both environments watched for 24 h
- [ ] All Gate-4 smoke tests repeated on the production URL
- [ ] Local Windows deployment **kept running** (LAN fallback) — decommission decision is a separate, later approval

## Gate 7 — Cloud-ready declaration
Only when deployment, TLS, DNS, database, file storage, authorization, backups, monitoring **and a tested restoration** are ALL green above may DWES be declared cloud-ready. Sign-off:

| Gate | Date passed | Signed |
|---|---|---|
| 0–7 | — | — |
