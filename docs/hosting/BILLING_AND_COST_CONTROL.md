# DWES Billing & Cost Control

**Date: 2026-07-13.** Sources: official pricing pages (accessed 2026-07-13; see `HOSTING_PROVIDER_COMPARISON.md`). Goal: **zero surprise charges.** Budget is not yet decided — this doc shows exactly what each option costs and how each provider behaves at the limit.

## 1. Overage behaviour by provider (the fact that matters most)

| Provider | Card needed | At the limit | Surprise-bill risk |
|---|---|---|---|
| Neon (free) | **No** | Compute **suspends** until next month — cannot charge you | **None** |
| Cloudflare free / Pages | No (R2 needs billing enabled) | Hard limits; static hosting unlimited | None (Pages) / Low (R2: $0.015/GB past 10 GB) |
| Railway | Yes (Hobby prepay) | **Usage-based — bills grow with use** | **Real — must configure limits (below)** |
| Render | Only for overages | Free tier suspends without card; with card, overages bill | Low→Medium |
| Fly.io | Yes | PAYG — bills grow | Real — set spend notifications |
| Supabase Pro | Yes | **Spend cap ON by default** (good) | Low |
| AWS free plan | — | No charge without explicit paid conversion; account auto-closes at 6 mo | None (but hosting ends) |
| Azure / GCP trials | Yes | No auto-charge; explicit upgrade required; resources stop | None (but hosting ends) |
| Hetzner / DO | Yes | Flat monthly price + metered extras | Low (predictable) |
| OCI Always Free | Yes | Free resources never bill; anything outside them does — **stay in "Always Free-eligible" shapes only** | Low if disciplined |

## 2. Expected monthly cost (pre-calculated, Option C)

| Item | Plan | Expected |
|---|---|---|
| Cloudflare (DNS, Pages, Worker route, R2 ≤10 GB) | Free | **$0** |
| Neon Postgres 18 (9.5 MB DB vs 0.5 GB limit) | Free | **$0** |
| Railway Hobby subscription | $5 incl. $5 usage | **$5** |
| Railway usage beyond included (API ~0.5 GB RAM + volumes + egress) | usage | **$0–2** |
| **Total** | | **≈ $5–7/month** (≈ AED 18–26) |
Growth scenario (10× files, 3× users): ≈ $15–25/mo. Every other option's costs are in `RECOMMENDED_ARCHITECTURE.md`.

## 3. Mandatory alert configuration (do at account creation, before first deploy)

- **Railway:** Settings → Usage → set a **hard usage limit** (e.g. $15) — service stops rather than overspending — plus email alerts at lower thresholds. Railway's native thresholds substitute for 50/75/90/100%: set alert ~$8 and hard cap $15.
- **Cloudflare/R2:** enable billing notifications; R2 usage alert at 5 GB (50%) and 9 GB (90%) via dashboard notifications.
- **Neon:** consumption emails on (Settings → notifications); nothing can charge on the free plan regardless.
- **Card hygiene:** one card, low limit if possible; calendar reminder monthly ("check 3 dashboards' usage pages" — 5 minutes); review the first two real invoices line-by-line.
- **If OCI is ever opened:** create a **budget** with alert rules at 50/75/90/100% of $1 (any charge at all is a mistake in an Always-Free deployment) and use only shapes/sizes marked "Always Free-eligible".

## 4. Rules
1. Never enter a card where the assessment says it isn't required (Neon).
2. Never enable "pay as you grow"/spend-cap-off options.
3. Any provider whose overage behaviour is unclear → treated as auto-charging → avoided unless explicitly approved (this disqualified nothing in Option C).
4. New paid services require re-running the cost table above first.
5. Trials (AWS/Azure/GCP credits) are never load-bearing for production.
