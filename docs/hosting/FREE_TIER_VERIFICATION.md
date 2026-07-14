# DWES Free-Hosting Reality Check

**Date: 2026-07-13.** This document answers one question honestly: **can DWES run safely and reliably at zero monthly cost?** Evidence comes from `HOSTING_PROVIDER_COMPARISON.md` (official sources, accessed 2026-07-13) and the measured requirements in `HOSTING_REQUIREMENTS.md`. Trials are not counted as free hosting.

## What "free" actually looks like in 2026

The free-tier landscape has contracted sharply:

| Provider | 2026 free reality |
|---|---|
| Railway | One-time $5 trial credit only |
| Fly.io | No free tier (pay-as-you-go) |
| Koyeb | Free tier closed to new users (Mistral acquisition) |
| AWS | $100–200 credits; **account auto-closes after 6 months** |
| GCP / Azure | Trial credits + limited allowances; no free Postgres |
| Render | Free compute sleeps; **free Postgres deleted after 30 days**; no free disks |
| Hetzner / DigitalOcean | Never had free tiers |
| Oracle Cloud | The one genuine always-on free VM (2 OCPU/12 GB Arm) — **but the user cannot create an account** |

What genuinely remains free and production-legal: **Cloudflare Pages** (static frontend, unlimited), **Neon** (managed Postgres 18, 0.5 GB), **Supabase free** (PG 17 + 1 GB storage, pauses after 1 week idle), **Cloudflare R2 / Backblaze B2** (10 GB object storage). Note the gap: **no free always-on compute with a persistent disk exists anywhere** (except blocked OCI).

## The user's checklist, answered

| Check | Answer on a $0 stack | Evidence |
|---|---|---|
| Will the backend sleep? | **Yes.** Render free spins down after 15 min idle; no free alternative avoids this (OCI blocked) | render.com/docs/free |
| Will the first user experience a cold start? | **Yes — ~1 minute** on Render free; every morning, and after every idle gap | render.com/docs/free |
| Does the database expire? | Render free PG: **yes, 30 days**. Neon free: no — suspends but persists. Supabase free: pauses after 1 week idle, resumable | provider docs |
| Are local files deleted on restart/deploy? | **Yes — fatal.** No free compute tier offers a persistent disk. Every deploy/restart wipes `uploads/` (all drawings/frames) and `dwes_auth.sqlite` (all passkeys + refresh tokens) | render.com/docs/free; comparison doc |
| Can uploaded drawings be permanently stored? | Only by migrating uploads to R2/B2 free object storage — **a code change** (no S3 integration exists today, verified). The SQLite auth store still has no free persistent home | repo inspection |
| Is the free database large enough? | **Yes, comfortably.** DWES DB = 9.5 MB measured vs 500 MB (Neon/Supabase). Growth ~1–5 MB/yr | measured 2026-07-13 |
| Enough RAM for NestJS + Prisma? | Marginal. Free instances are 512 MB; baseline fits (~120–200 MB) but a 50 MB buffered upload + Excel parse approaches the ceiling | HOSTING_REQUIREMENTS.md |
| Can PDF generation complete within limits? | On container hosts, yes (pdfkit is pure-JS, no timeout regime). On serverless platforms, irrelevant — they're disqualified by the body-size and SQLite constraints anyway | repo inspection |
| Are large Excel/PDF/3D uploads supported? | 50 MB passes container hosts and Cloudflare's proxy (100 MB free-plan body limit). Serverless: no (e.g. Cloud Run caps at 32 MiB) | comparison doc |
| Can multiple technicians work concurrently? | **Yes** — 5–15 concurrent users is well within even a 512 MB instance for JSON traffic | k6 target 120 VU on 2 OCPU |
| Are automated backups available? | **No** on free compute; Render free PG has no backups. Neon/Supabase free offer limited platform recovery — DWES's own `pg_dump` job must run somewhere, and free tiers give it no scheduler | provider docs |
| Is commercial/business use allowed? | Cloudflare, Neon, Supabase, Render: yes. **Vercel Hobby: no** (non-commercial only) | vercel.com/docs/plans/hobby |
| Can the service be restored after failure? | Only with our own dump/tarball procedures running externally (e.g. from the office PC) — free tiers provide no DR for files | BACKUP_AND_RESTORE_RUNBOOK.md |

## The three hard blockers at $0

1. **File persistence.** `uploads/` is the system of record for all engineering files. Free compute is ephemeral; free object storage (R2/B2) would hold the files but requires greenfield code changes and still leaves blocker 2.
2. **The passkey/refresh-token SQLite store** needs a real disk. No free tier provides one. Every restart would silently delete every enrolled fingerprint/passkey — unacceptable even for a serious pilot with technicians on tablets.
3. **Sleeping backend.** A 1-minute cold start for the first technician every shift, plus WebAuthn ceremonies that can time out during wake-up.

## Verdict

**Conclusion 4 — a small paid deployment is required for reliable production use.**

- Realistic minimum: **≈ US$5–12/month** (Railway Hobby or Fly.io: API + Postgres 18 container + persistent volumes; frontend free on Cloudflare Pages; R2 free for backups). Details in `RECOMMENDED_ARCHITECTURE.md`.
- **Completely free IS viable for development/pilot testing** (conclusion 2 applies to that use only): Cloudflare Pages (frontend) + Render free (API, sleeps) + Neon free (PG 18) — accepting wiped uploads/passkeys per deploy and cold starts. Usable to validate the cloud setup, not to run the business.
- **The $0-production exception:** if an Oracle Cloud account can ever be opened, OCI Always Free (2 OCPU/12 GB Arm + 200 GB volume, me-dubai-1) runs the entire existing Docker-Compose stack at $0 with none of the blockers above — the repo's `infra/` was built for exactly this. It is unavailable today solely because signup failed. Worth one retry attempt before paying, but not worth blocking on.
