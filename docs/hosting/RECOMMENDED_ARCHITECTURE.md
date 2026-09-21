# DWES Deployment Architectures — Comparison & Recommendation

**Date: 2026-07-13.** Inputs: `HOSTING_REQUIREMENTS.md` (measured needs), `HOSTING_PROVIDER_COMPARISON.md` (verified provider facts), `FREE_TIER_VERIFICATION.md` (free-tier verdict). Constant across ALL options: the app is served at **`dwes.ingenious-network.com`** (WebAuthn passkeys are bound to this domain — keeping it constant means passkeys survive any provider migration), DNS moves to **Cloudflare** (free, enables every option below), and the existing GitHub Actions CI continues unchanged.

---

## OPTION A — Single-provider deployment (Railway, all-in-one)

```
                    Cloudflare DNS (free)
                            │
            dwes.ingenious-network.com
                            │
        ┌───────────────────▼────────────────────┐
        │                RAILWAY                  │
        │  ┌──────────┐  ┌─────────┐  ┌────────┐ │
        │  │ frontend  │  │ NestJS  │  │postgres│ │
        │  │ (static/  │─▶│  API    │─▶│  :18   │ │
        │  │  Caddy)   │  │ :3001   │  │ image  │ │
        │  └──────────┘  └────┬────┘  └───┬────┘ │
        │                 [volume]     [volume]   │
        │              uploads+sqlite   pgdata    │
        │  ┌──────────────────────────────────┐  │
        │  │ cron service: nightly pg_dump +  │  │
        │  │ uploads tar → Cloudflare R2      │──┼──▶ R2 (free 10 GB, off-provider DR)
        │  └──────────────────────────────────┘  │
        └─────────────────────────────────────────┘
```

- **Services:** Railway Hobby ($5/mo incl. $5 usage) hosting 3 services + 2 volumes + 1 cron job; Cloudflare DNS + R2 for off-site backup copies.
- **Free limits:** none (Railway trial is one-time $5). R2 free 10 GB.
- **Normal cost:** ≈ **$8–12/mo** (API ~0.5 GB RAM ≈ $5, PG ~0.25–0.5 GB ≈ $2.5–5, volumes <$1, static service ~$0–2, egress $0.05/GB). **Growth cost:** +$5/GB-RAM; storage $0.15/GB — at 10× usage still ≈ $20–30/mo.
- **Security responsibilities:** app-level only (platform patches OS/runtime); we manage secrets in Railway dashboard, CORS not needed (same-origin via Railway's router or one domain per service), TLS automatic.
- **Maintenance:** low — no SSH, no OS. Redeploys from GitHub pushes.
- **Backup:** nightly cron service runs `pg_dump` + volume tar → R2 (adaptation of `infra/oci/scripts/backup-oci.sh`, **including `dwes_auth.sqlite`** — closing the known gap). **Recovery:** restore dump into fresh PG service, untar volume; RTO well under 4 h.
- **Performance:** Southeast Asia (Singapore) region ⇒ UAE ~110–130 ms, India ~50–90 ms. Fine for JSON; noticeable on 14 MB drawing downloads.
- **Cold starts:** none (always-on) — sleep is optional, not forced.
- **Advantages:** one dashboard, one bill, volumes solve uploads+SQLite with **zero code changes**, PG 18 exact match (own image), simplest mental model.
- **Disadvantages:** self-tended Postgres (backups are our cron, not a managed-DB guarantee); usage-based billing needs alerts; no ME region.
- **Migration difficulty:** low — Dockerfiles as-is; leaving Railway = pg_dump + volume tar + DNS change.
- **Suitability: GOOD — the best simple single-provider option available to this user today.** (The $0 single-provider variant — OCI Always Free running the existing Compose stack — is technically superior but blocked at signup.)

## OPTION B — Split free-tier (pilot only)

```
 Cloudflare DNS (free)
   ├── dwes.ingenious-network.com ──▶ Cloudflare Pages (frontend, free, unlimited)
   │        └── /api/* via Worker-proxy or CNAME api.dwes… ─▶ Render free (NestJS)
   │                                                            │ sleeps 15 min idle
   │                                                            │ EPHEMERAL disk ⚠
   └── (backups) R2 free 10 GB                                  ▼
                                                     Neon free (Postgres 18, 0.5 GB)
```

- **Services:** Cloudflare Pages + Render free web service + Neon free + R2. All genuinely free, commercial use allowed.
- **Free limits:** Pages unlimited static; Render 750 h/mo, sleeps after 15 min, ~1 min wake; Neon 0.5 GB/100 CU-h (DWES uses ~2% of both); R2 10 GB.
- **Cost:** **$0.** **Growth cost:** n/a — you'd move to C before outgrowing it.
- **Security responsibilities:** app-level; three dashboards; CORS: either same-origin via a Cloudflare Worker route proxying `/api/*` (no code change) or `CORS_ORIGINS` + configurable API base URL (one-line code change, needs approval).
- **Backup:** manual/scripted dumps from the office PC (Neon connection string) → R2; uploads are **ephemeral — anything uploaded is lost on every deploy/restart**, and all passkeys/refresh tokens with it.
- **Performance/cold start:** first request after idle waits ~60 s; Neon resumes in ~1 s.
- **Advantages:** $0; validates the entire cloud path (DNS, TLS, split origins, Neon PG 18) before spending; every piece carries forward to Option C.
- **Disadvantages:** ephemeral uploads + passkey wipes + cold starts ⇒ **not production**; three vendors to coordinate.
- **Migration difficulty:** to Option C: trivial (same DNS/frontend/DB; move API to a paid volume host).
- **Suitability: PILOT ONLY** — exactly what `FREE_TIER_VERIFICATION.md` concluded.

## OPTION C — Low-cost managed production (RECOMMENDED)

```
 Cloudflare (free plan: DNS + CDN + WAF basics)
   │
   ├── dwes.ingenious-network.com ─────▶ Cloudflare Pages (frontend, free)
   │         │
   │         └── /api/* (Worker route, same-origin)
   │                      │
   │                      ▼
   │            RAILWAY (Singapore)             NEON (Singapore)
   │            ┌─────────────────┐   TLS      ┌────────────────┐
   │            │  NestJS API     │───────────▶│ Postgres 18    │
   │            │  :3001          │            │ managed, free  │
   │            │  [volume:       │            │ PITR/branches  │
   │            │   uploads +     │            └────────────────┘
   │            │   dwes_auth.db] │
   │            │  cron: backup ──┼──▶ Cloudflare R2 (free 10 GB)
   │            └─────────────────┘      nightly dump + uploads tar + sqlite
```

- **Services:** Cloudflare Pages (frontend, $0) · Railway Hobby (API + volume + backup cron, ~$5–7) · **Neon free (managed Postgres 18** — exact version match, professionally durable, $0) · R2 ($0).
- **Free limits used:** Pages unlimited; Neon 0.5 GB (DB is 9.5 MB); R2 10 GB.
- **Normal cost:** ≈ **US$5–7/month.** **Growth cost:** Neon Launch when DB outgrows free (~years away); Railway RAM +$10/GB; ≈ $15–25/mo at several-fold growth.
- **Security responsibilities:** app hardening (see `SECURITY_IMPLEMENTATION_PLAN.md`); secrets in Railway/Neon dashboards; TLS managed end-to-end (Cloudflare + Railway + Neon `sslmode=require`); DB reachable only over TLS, not co-hosted.
- **Maintenance: the lowest of any production option** — no SSH, no OS, no DB administration (Neon handles durability/failover/PITR), platform dashboards for logs/metrics.
- **Backup:** two independent layers — Neon's built-in recovery **plus** our nightly cron (pg_dump + uploads tar + sqlite copy → R2, off-provider). **Recovery:** documented in `BACKUP_AND_RESTORE_RUNBOOK.md`; RTO < 2 h, RPO ≤ 24 h (better via Neon PITR for the DB).
- **Performance:** API+DB colocated in Singapore (single-digit ms between them); UAE users ~110–130 ms, India ~50–90 ms; static assets served from Cloudflare's edge (UAE PoPs) — the app *feels* fast because the heavy first-load is edge-cached.
- **Cold starts:** none for API (always-on); Neon may micro-suspend between requests but resumes ~1 s and DWES's constant health polling keeps it warm during shifts.
- **Advantages:** cheapest real production; managed PG 18 with true durability; files+SQLite on a real volume (zero code change); off-provider DR; every component replaceable (standard PG, standard containers, S3-compatible storage); frontend bandwidth free forever.
- **Disadvantages:** three vendors (Cloudflare/Railway/Neon); the `/api` same-origin Worker proxy is one more moving part (alternative: one-line configurable API base URL + CORS — a code change requiring approval); no ME region (latency acceptable, not optimal).
- **Migration difficulty:** low in and out — this is the portability-maximal shape.
- **Suitability: RECOMMENDED for DWES production.**

## OPTION D — Self-managed VPS (Docker Compose as designed)

```
 Cloudflare DNS ──▶ VPS (Hetzner Falkenstein €5.49 / DO Bangalore ~$8)
                    ┌──────────────────────────────────────────┐
                    │ docker compose (infra/docker/, as-built)  │
                    │  nginx:80/443 ─▶ api:3001 ─▶ postgres:18  │
                    │  certbot (LE TLS) · backup cron → R2/B2   │
                    │  volumes: pgdata · uploads · auth-sqlite  │
                    └──────────────────────────────────────────┘
                    + SSH (Ed25519), UFW firewall, fail2ban,
                      unattended-upgrades  ← all on YOU
```

- **Services:** one VPS runs the repo's existing production Compose stack **unmodified** — this is exactly what `infra/` was built for (the OCI VM is just a VPS). Hetzner CX23 €5.49/mo (EU) or DigitalOcean 1–2 GB droplet $6–8/mo (Bangalore, better latency) + ~20% for provider backups.
- **Normal cost:** ≈ **$7–10/mo.** **Growth cost:** next size up ≈ $12–16.
- **Security responsibilities: ALL of them** — SSH hardening, firewall, OS patching, Docker updates, TLS renewal (certbot, already scripted post-H2-fix), fail2ban, monitoring. The repo mitigates heavily (`infra/oci/cloud-init.yaml`, `docs/SECURITY-NETWORK-AUDIT.md`, `deploy-dev.yml` SSH pipeline, audited scripts) but **incident response lands on a person who is still learning SSH/TLS/DNS**.
- **Maintenance:** highest — weekly attention; you are the DBA, sysadmin, and on-call.
- **Backup:** existing `backup-oci.sh` pattern (pg_dump + uploads tar) to R2/B2 + provider snapshots. **Recovery:** documented, but hands-on (new VPS, restore, DNS).
- **Performance:** excellent for the money (dedicated-ish resources, no platform overhead); DO Bangalore ~30–45 ms to UAE; Hetzner EU ~120–150 ms.
- **Cold starts:** none.
- **Advantages:** maximal reuse of existing work; full control; predictable flat bill; best price/performance; no platform limits (body size, regions, PG version).
- **Disadvantages:** the operational burden is real and permanent, and it is mismatched to the user's self-described skill level today. A neglected VPS becomes a security liability.
- **Migration difficulty:** lowest of all (plain Docker + volumes anywhere).
- **Suitability: GOOD but deferred** — the right destination once cloud-ops confidence exists; not the right first step for this user, despite the repo being ready for it. Do not choose it "because it looks cheap."

---

## Final recommendation matrix

| Category | Winner | Est. cost | Security | Reliability | Ops complexity |
|---|---|---|---|---|---|
| Best completely free (dev/pilot) | **Option B** (CF Pages + Render free + Neon + R2) | $0 | Medium | Low (by design) | Low-Med |
| Best low-cost production | **Option C** (CF Pages + Railway + Neon + R2) | ~$5–7/mo | High (managed layers + our hardening) | High | **Low** |
| Best single-provider | **Option A** (Railway all-in) — or OCI at $0 *if signup ever succeeds* | ~$8–12/mo | High | Med-High | Low |
| Best split-stack | **Option C** | ~$5–7/mo | High | High | Low |
| Best UAE/India latency | **Fly.io Mumbai** variant of C (API+PG containers in `bom`) or DO Bangalore VPS | ~$8–14/mo | High | Med-High | Medium |
| Best raw price/perf (accepting ops burden) | **Option D** Hetzner | ~$7/mo | You-dependent | You-dependent | **High** |

### Recommendation: **Option C**, with Option B as its free rehearsal

Deploy Option B first (a weekend's work, $0) to validate DNS, TLS, the Cloudflare front, and Neon. Then attach the paid Railway API + volume (Option C) for go-live. B literally *is* C minus the paid API host, so nothing is thrown away.

### Why the others were rejected
- **A (Railway all-in):** fine, but self-tended Postgres for the system of record when Neon gives managed PG 18 *for free* is a worse trade at the same or higher price.
- **B alone:** ephemeral uploads and passkey wipes — disqualified for production by the file-persistence blockers in `FREE_TIER_VERIFICATION.md`.
- **D (VPS):** operational burden mismatched to the user's current skills; chosen tools should fail toward "platform handles it," not toward "3 a.m. SSH session." Revisit in 6–12 months.
- **OCI Always Free:** would win outright ($0, Dubai region, existing infra) — rejected only because the account cannot be created. Worth one final signup retry before paying anything.
- **Hyperscalers (AWS/Azure/GCP):** UAE regions exist but at 2–5× the cost with 10× the billing complexity; their "free" tiers are trials (AWS auto-closes at 6 months; Azure's cliff is at 12). Overkill for 5–15 users.
- **Vercel/Netlify/Firebase/Koyeb:** ToS (non-commercial), architecture mismatch, or free tier closed — see comparison doc.

### Approval-gate constraint
Nothing in this document has been provisioned. Per the project brief, deployment starts only after the user approves an option (see `FINAL_DEPLOYMENT_CHECKLIST.md` for the gated sequence). One code decision needs explicit user approval either way: **same-origin Worker proxy (zero code change) vs. configurable API base URL + CORS (one-line change)** — recommendation: start with the Worker proxy, adopt the env var during the first normal maintenance window.
