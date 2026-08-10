# DWES Hosting Provider Comparison (Provider-Neutral)

**Research date: 2026-07-13.** Every claim below was verified against the provider's official pricing/documentation pages on this date (sources cited per provider). Third-party summaries were used only where the official page could not be machine-read, and are marked as such. Prices change — re-verify before purchase.

**DWES-specific pass/fail criteria** (from `HOSTING_REQUIREMENTS.md`): PostgreSQL **18** (or documented downgrade path), **persistent disk** for `uploads/` + `dwes_auth.sqlite`, **≥50 MB** request bodies, always-on (or acceptable cold starts for pilot only), custom domain + TLS for `dwes.ingenious-network.com`, commercial use allowed, UAE/India proximity preferred.

Classification: **GREEN** = suitable for DWES production · **AMBER** = testing/pilot only, or suitable only in its paid tier / for part of the stack · **RED** = unsuitable.

---

## Master comparison table

| Provider | Frontend | NestJS backend | PostgreSQL | File storage | Docker | Custom domain | SSL/TLS | Persistent storage | Sleep behaviour | Free-plan limits | Card required | Production suitability | Est. monthly cost (DWES) | Main risks | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Oracle Cloud (OCI)** | ✔ (nginx on VM) | ✔ | ✔ self-run PG 18 | ✔ block vol + 20 GB obj storage | ✔ Compose | ✔ | ✔ certbot | ✔ 200 GB | none (always-on VM) | 2 OCPU/12 GB Arm, 200 GB, 10 TB egress — permanent | Yes | High (on paper) | **$0** | **Account signup blocked for user**; idle-VM reclamation; ops burden | AMBER¹ |
| **Render** | ✔ static | ✔ | ✔ managed (free expires!) | Disks on paid only | ✔ image deploy | ✔ | ✔ auto | Paid disks $0.30/GB | Free: sleeps 15 min, ~1 min wake | 750 h, free PG **deleted after 30 d**, no disks | No (until overage) | Paid only | $0 pilot / ~$14+ paid | Free PG expiry; no ME/India region | AMBER |
| **Koyeb** | ✔ | ✔ | Serverless PG | Volumes (Pro) | ✔ | ✔ | ✔ | Pro only | Free inst. scale-to-zero 1 h | Free Starter **closed to new users** (Mistral acquisition 2026-02); Pro $29/mo entry | Yes | Low | $29+ | Post-acquisition pivot to AI; pricing churn | RED |
| **Railway** | ✔ static via service | ✔ | ✔ own postgres:18 image + volume | ✔ volumes $0.15/GB | ✔ Dockerfile | ✔ | ✔ auto | ✔ volumes (5 GB Hobby) | Optional serverless sleep | Trial: one-time $5 credit only — no permanent free | Yes (Hobby prepay) | Good | ~$5–12 (Hobby + usage) | Usage billing drift; no ME region (US/EU/SE-Asia) | GREEN (paid) |
| **Fly.io** | ✔ static via app | ✔ | Self-run PG 18 on volume (MPG is $38/mo, PG 16) | ✔ volumes $0.15/GB | ✔ (native) | ✔ | ✔ (10 certs free) | ✔ volumes | Auto-stop optional | **No free tier** (PAYG) | Yes | Good | ~$7–12 | Self-run single-node PG; India egress $0.12/GB | GREEN (paid) |
| **Cloudflare Pages/Workers** | ✔✔ (unlimited static) | ✘ (10 ms CPU Workers; no Nest) | ✘ | (see R2) | Containers product separate | ✔ | ✔ | n/a | none for static | 100k req/day Workers; static assets free & unlimited | No | Frontend: excellent | $0 (frontend) | Backend impossible without rewrite | GREEN (frontend only) |
| **Cloudflare R2** | – | – | – | ✔✔ S3-compatible object storage | – | – | – | ✔ | – | 10 GB storage, 1 M class-A + 10 M class-B ops/mo, **zero egress fees** | Yes (to enable R2) | Storage: excellent | $0 (≤10 GB) | none material at DWES scale | GREEN (storage) |
| **Vercel** | ✔ (technically) | Functions only | ✘ (marketplace) | Blob | ✘ | ✔ | ✔ | ✘ | Functions scale-to-zero | Hobby: **non-commercial use only** (fair-use policy) | No (Hobby) | Unsuitable | $0 illegal / $20+seat | ToS violation for a business app | RED |
| **Netlify** | ✔ | Functions only | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | n/a static | 300 credits/mo (bandwidth 20 cr/GB ⇒ ~15 GB; deploys 15 cr) | No | Frontend pilot only | $0 / $20 Pro | Credit model burns fast; no backend/PG | AMBER (frontend) |
| **Supabase** | ✘ | ✘ (edge fn only) | ✔ managed **PG 17** (18 later) | ✔ Storage 1 GB free | ✘ | via app host | via app host | ✔ | Free project **pauses after 1 week inactivity** | 500 MB DB, 1 GB storage, 5 GB egress, 2 projects | No (free) | DB+storage: pilot GREEN / prod on Pro | $0 / $25 Pro | Pause on idle; PG 17 ≠ 18 (needs plain-SQL restore); no ME region (Mumbai ✔) | AMBER (free) / GREEN (Pro, DB only) |
| **Neon** | ✘ | ✘ | ✔✔ managed **PG 18 GA (default)** | ✘ | ✘ | n/a | n/a | ✔ | Compute scale-to-zero after 5 min (sub-second-to-few-s resume) | 0.5 GB storage, 100 CU-h/mo, 5 GB egress; **suspends, never auto-charges** | **No** | DB: very good (DWES DB = 9.5 MB) | **$0** | Cold resume latency; Singapore nearest region | GREEN (DB only) |
| **Firebase** | ✔ Hosting | Via App Hosting→Cloud Run | Cloud SQL (3-mo trial, then ~$9.37+/mo) | Cloud Storage | indirect | ✔ | ✔ | ✘ | scale-to-zero | Spark: no card, 10 GB hosting | No (Spark) | Poor fit | n/a | Architecture mismatch + GCP lock-in detour | RED |
| **Google Cloud** | ✔ (bucket/CDN) | ✔ Cloud Run | Cloud SQL (no free; 30-d trial) | ✔ GCS 5 GB (US only) | ✔ | ✔ | ✔ | ✘ Cloud Run (stateless) | Cloud Run scale-to-zero | e2-micro US-only; Cloud Run 2 M req/mo; $300/90-d trial, no auto-charge | Yes | Possible but poor fit | ~$15–30 after trial | **Cloud Run 32 MiB request cap blocks 50 MB uploads**; SQLite store has no home; complexity | AMBER |
| **Microsoft Azure** | ✔ Static Web Apps | ✔ App Service | ✔ Flexible Server (750 h × 12 mo free) | ✔ Blob | ✔ | ✔ | ✔ | ✔ (paid) | F1: 60 CPU-min/day | $200/30-d credit + 12-mo free services; then full price | Yes | 12-month cliff | $0 yr-1 → ~$25–40 | Cost jump after 12 months; enterprise complexity; UAE North region ✔ (paid) | AMBER |
| **AWS** | ✔ S3+CloudFront | ✔ Lightsail/ECS | ✔ RDS/Lightsail DB | ✔ S3 | ✔ | ✔ | ✔ | ✔ | n/a | **Free plan = $100–200 credits, account AUTO-CLOSES at 6 months** | Yes (paid plan) | Paid only | trial / ~$15–25 paid | Trial masquerading as free tier; billing complexity; me-central-1 ✔ (paid) | AMBER |
| **DigitalOcean** | ✔ App Platform (3 free static) | ✔ droplet/App Platform | ✔ self-run 18 or managed ($15+) | ✔ volumes, Spaces | ✔ Compose | ✔ | ✔ | ✔ | none (always-on) | No free compute (promo credits only) | Yes | Good | ~$7–10 (droplet) | Self-managed ops; Bangalore ✔, no ME region | GREEN (paid) |
| **Hetzner** | ✔ (nginx on VPS) | ✔ | ✔ self-run PG 18 | ✔ volumes, object storage | ✔ Compose | ✔ | ✔ certbot | ✔ | none (always-on) | No free tier | Yes | Good | ~€6–7 (CX23 €5.49 +IPv4) | **EU-only** (~120–150 ms to UAE); Jun-2026 price rises; full self-managed ops | GREEN (paid, latency caveat) |
| **Backblaze B2** | – | – | – | ✔ S3-compatible | – | – | – | ✔ | – | 10 GB free; $6.95/TB; egress free ≤3× storage (unlimited via Cloudflare) | No strict req. | Storage: good | $0 | US/EU regions only | GREEN (storage) |

¹ OCI is GREEN on technical merit ($0, permanent, me-dubai-1 region, matches existing `infra/` exactly) but **AMBER in practice**: the user cannot complete account signup, Always Free A1 is now 2 OCPU/12 GB (reduced), signup requires card + strict verification (the very step that failed), and idle instances can be reclaimed.

---

## Per-provider verification notes & sources (accessed 2026-07-13)

### Oracle Cloud Infrastructure
Permanent Always Free: A1 Arm 1,500 OCPU-h + 9,000 GB-h/mo (= 2 OCPU + 12 GB continuous), 2× AMD micro (1 GB), 200 GB block storage (home region), 20 GB object storage, 10 TB egress/mo, free Bastion. Conditions: home-region-only for compute/volumes; **idle reclamation** if 7-day CPU/network/memory <20%; card + identity verification at signup — **this is the step that failed for the user; treat as unavailable unless signup succeeds later** (retry tips: matching card/address identity, no VPN, sometimes takes days).
Source: docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

### Render
Free web services: sleep after 15 min idle, ~1 min cold start, 750 instance-h/mo, **no persistent disks on free**. Free Postgres: 1 GB, **expires 30 days after creation** (deleted after further 14-day grace) — unusable beyond a demo. Paid: Starter $7/mo (512 MB/0.5 vCPU), managed PG from ~$6/mo (basic-256mb), disks $0.30/GB/mo. Regions: US/EU (Frankfurt)/Singapore — nothing near UAE/India. No card needed to start.
Sources: render.com/docs/free; render.com/pricing; render.com/docs/postgresql (paid tiers via search results — verify exact DB tier at purchase)

### Koyeb
Acquired by Mistral AI (Feb 2026); **free Starter tier closed to new signups**; entry is Pro $29/mo + compute. Legacy free instance (512 MB/0.1 vCPU, forced scale-to-zero after 1 h) only for pre-existing accounts. Free 5-h Postgres trial only. Regions: US/EU/Singapore.
Sources: koyeb.com/pricing; koyeb.com/docs/faqs/pricing; press coverage of acquisition (multiple sources, 2026)

### Railway
No permanent free plan — one-time $5 trial credit (no card). Hobby: $5/mo including $5 usage; rates: RAM $10/GB/mo, vCPU $20/mo, volumes $0.15/GB/mo, egress $0.05/GB. Volumes ≤5 GB on Hobby (fits DWES). Postgres deployed as a Docker image on a volume — **can pin postgres:18**. Regions: US, EU, Southeast Asia (no ME). DWES estimate: API (0.5 GB RAM always-on ≈ $5) + PG container (≈ $2.5–5) + volumes (<$1) ⇒ **≈ $5–12/mo total**.
Source: docs.railway.com/reference/pricing/plans; railway.com/pricing

### Fly.io
No free tier (PAYG; legacy allowances grandfathered pre-Oct-2024 only). shared-cpu-1x 512 MB ≈ $3.32/mo (region-dependent; bom higher), volumes $0.15/GB/mo, first 10 GB snapshots free. Managed Postgres from **$38/mo, PG 16 default — no PG 18** ⇒ for DWES, self-run `postgres:18` on a volume instead. Regions incl. **Mumbai (bom)**; no UAE. Egress: $0.02/GB NA-EU, $0.12/GB India. 10 free TLS certs. Card required. DWES estimate: API 512 MB + PG 256–512 MB + 2 volumes ⇒ **≈ $7–12/mo**.
Sources: fly.io/docs/about/pricing/; fly.io/docs/mpg/

### Cloudflare (Pages/Workers · R2 · DNS)
Static hosting (Pages/Workers assets): **free, unlimited requests and bandwidth**, custom domains + TLS, no card, no documented non-commercial restriction. Workers free: 100k req/day, 10 ms CPU — cannot host NestJS (a port would be a rewrite; Containers is a separate paid product). **R2**: 10 GB-mo storage free, 1 M class-A + 10 M class-B ops/mo, **$0 egress**, then $0.015/GB-mo; card/billing setup required to enable. DNS proxy body limit **100 MB on Free/Pro** — passes DWES's 50 MB uploads.
Sources: developers.cloudflare.com/workers/platform/pricing/; developers.cloudflare.com/r2/pricing/; developers.cloudflare.com/workers/platform/limits/ (body limits corroborated by 2026 community/limits docs)

### Vercel
Hobby (free) is explicitly **restricted to non-commercial, personal use** (fair-use guidelines; confirmed on `/docs/plans/hobby`, last updated 2026-06-16). Overages pause features (no auto-charge). Pro $20/user/mo. DWES is a commercial business application ⇒ Hobby is a ToS violation regardless of technical fit.
Source: vercel.com/docs/plans/hobby

### Netlify
Free plan now credit-based: 300 credits/mo; bandwidth costs 20 credits/GB (≈15 GB/mo effective), production deploys 15 credits each, compute 10 credits/GB-h. Custom domain + TLS free. Pro $20/mo (3,000 credits). Frontend-only (no PG, no persistent backend).
Source: netlify.com/pricing

### Supabase
Free: 500 MB Postgres (shared CPU/500 MB RAM), 1 GB file storage, 5 GB egress, 50k MAU, 2 projects; **paused after 1 week of inactivity** (DWES weekday traffic would normally prevent this; a 2-week site shutdown would not). Pro from $25/mo (8 GB disk, 100 GB storage, 250 GB egress, spend-cap ON by default). Postgres **17** current default (18 to follow) ⇒ restore via plain SQL, not v18 custom dump. Regions include **Mumbai**; no Middle East region.
Sources: supabase.com/pricing; supabase.com/docs/guides/platform/regions; supabase.com/changelog (PG-17 default)

### Neon
Free: 0.5 GB storage/project, 100 CU-h compute/mo, 5 GB egress, no card required; on limit-hit compute **suspends until next month — never auto-charges**. Scale-to-zero after 5 min idle (fast resume). **Postgres 18 is GA and the default for new projects** — exact version match for DWES's v18.3 dumps. Paid Launch: $0.106/CU-h + $0.35/GB-mo. Regions: US/EU/**Singapore**/Sydney — no Mumbai/ME. DWES DB (9.5 MB, ~1–5 MB/yr growth) fits the free tier for years.
Sources: neon.com/pricing; neon.com/docs/reference/compatibility; neon.com/blog/postgres-18; neon.com/docs/introduction/regions

### Firebase
Spark free (no card): Hosting 10 GB/360 MB-day, Functions 2 M/mo. Relational data = Cloud SQL detour (3-month trial then from ~$9.37/mo); NestJS = App Hosting→Cloud Run detour. Everything DWES needs routes into GCP proper with extra lock-in — no persistent disk for the SQLite store, no PG 18 guarantee.
Source: firebase.google.com/pricing

### Google Cloud
Free: e2-micro (US regions only), Cloud Run 2 M req + 180k vCPU-s + 360k GiB-s/mo (scale-to-zero), GCS 5 GB (US), **no free Cloud SQL** (30-day trial instance only). $300/90-day trial; card required; **no auto-charge — explicit upgrade needed**, account resources stop after trial. Blocker: **Cloud Run request size cap 32 MiB** breaks 50 MB uploads (would force direct-to-GCS upload redesign) and no persistent disk for SQLite.
Source: docs.cloud.google.com/free/docs/free-cloud-features

### Microsoft Azure
Free account: $200 credit/30 days + 12 months of select free services (750 h/mo B-series VM, PostgreSQL Flexible Server allowance, App Service F1 always-free at 60 CPU-min/day — too weak for DWES). Card required; no auto-charge without explicit upgrade to PAYG. **UAE North region exists (paid)**. Real cost after month 12: ≈$25–40/mo for VM+PG. A 12-month runway, then a price cliff.
Sources: azure.microsoft.com/en-us/pricing/purchase-options/azure-account (+ search corroboration; primary page intermittently unreachable during research)

### AWS
New free tier (post-2025): **$100 credits at signup (+up to $100 via activities), 6-month validity, free-plan account auto-closes** at 6 months or credit exhaustion — no charges without explicit paid-plan conversion, but also **no continuity**: this is a trial, not hosting. 30+ always-free services exist but none cover an always-on VM+PG stack. Paid path: Lightsail VPS (~$5–10) + managed/self-run PG; **me-central-1 (UAE) and Mumbai regions available (paid)**.
Source: aws.amazon.com/free/

### DigitalOcean
No free compute (promo credits occasionally; card required, charged at cycle end). Droplets from $4/mo (512 MB) — DWES realistic: **$6–8/mo 1–2 GB droplet, Bangalore region available**; backups +20–30%; block storage extra; managed PG from $15/mo (dev-tier 512 MB cheaper); App Platform: 3 free static sites (1 GiB egress each). Runs the existing Compose stack unmodified.
Sources: digitalocean.com/pricing/droplets; docs.digitalocean.com/products/app-platform/details/pricing/ (+ search corroboration for managed-PG tiers)

### Hetzner
No free tier. **June 2026 price adjustment** (official): CX23 (2 vCPU/4 GB) €5.49/mo, CAX11 Arm €5.99/mo; block storage ~$0.0572/GB/mo; 20 TB traffic included, then $1/TB. Locations: Germany, Finland, Singapore, US — **no UAE/India** (≈120–150 ms from UAE to Falkenstein). Object storage available (verify current price at purchase). Runs the existing Compose stack unmodified; excellent price/performance if EU latency is acceptable.
Sources: docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/; hetzner.com/cloud

### Backblaze B2
First 10 GB storage always free; $6.95/TB/mo PAYG; egress free up to 3× average monthly storage (and unlimited via Cloudflare/bunny CDN partners); S3-compatible. US/EU regions only.
Source: backblaze.com/cloud-storage/pricing

---

## Cross-cutting notes

- **CI/CD continuity:** GitHub Actions remains free for public repos and includes 2,000 min/mo for private repos — the existing `ci.yml` pipeline carries over to any provider. (The repo currently has **no `origin` remote configured** — a GitHub push is a prerequisite for any CI-based deploy path; see `PROJECT_STATUS.md`.)
- **PG 18 reality:** among managed Postgres, only **Neon** offers PG 18 today. Everywhere else, PG 18 means running the `postgres:18` container yourself (Railway/Fly/VPS — which the existing compose file already does) or accepting a plain-SQL restore into PG 17 (Supabase) with a documented procedure (`DATABASE_MIGRATION_GUIDE.md`).
- **The SQLite auth store** (`backend/data/dwes_auth.sqlite`) silently disqualifies every purely-ephemeral compute platform (Cloud Run, Workers, Vercel/Netlify functions) unless an approved architecture change relocates it. Volume-capable hosts (Railway, Fly, Render paid, any VPS, OCI) accommodate it as-is.
- **UAE latency:** only paid hyperscalers (AWS me-central-1, Azure UAE North, GCP me-central1/2) and OCI me-dubai-1 have in-region presence. For everyone else, Mumbai (Fly, DO, Supabase, AWS/GCP/Azure) at ~30–45 ms or EU/Singapore at ~110–160 ms are the fallbacks. DWES is a request/response app — EU latency is tolerable, but drawing downloads feel it.
