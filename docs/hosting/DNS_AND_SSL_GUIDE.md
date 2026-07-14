# DWES DNS & SSL/TLS Guide

**Date: 2026-07-13.** Written for an administrator new to DNS and TLS. **Nothing in this guide has been executed** — DNS today still points at Turbify cPanel and must not change until the approval gate passes.

## 1. Plain-language primer

- **DNS** is the internet's phone book. Your domain `ingenious-network.com` has entries ("records") saying which server answers for each name. `dwes.ingenious-network.com` is a *subdomain* — one entry pointing at wherever DWES lives. Changing providers later = changing one entry, not moving the domain.
- **Nameservers** are *who holds your phone book*. Today: Turbify. This plan moves the phone book to **Cloudflare (free)** — the domain itself stays registered wherever it is; only the record-keeping moves. Cloudflare is chosen because every architecture option in `RECOMMENDED_ARCHITECTURE.md` builds on it (free CDN, free TLS, Pages, R2, Worker routes).
- **TLS/SSL** is the padlock: it encrypts traffic so passwords and drawings can't be read in transit, and proves the server is really yours. Certificates expire and must renew — on every recommended option this is **automatic** (Cloudflare/Railway/Neon manage their own certs). You never buy a certificate.
- **A record** = name → IP address. **CNAME record** = name → another name (used for Pages/Railway). **Proxied (orange cloud)** = traffic flows through Cloudflare (hides your server, adds CDN/WAF, enforces the 100 MB upload pass-through we verified).

## 2. One rule above all — the domain must not change

WebAuthn passkeys (fingerprint logins) are cryptographically bound to `dwes.ingenious-network.com` (`RP_ID`). Deploy under any other name — including the mis-spelled `dwes.ingeniousnetwork.com` that still appears in some templates (see `SECURITY_AUDIT.md` G9) — and **every enrolled passkey silently breaks**. All configs (`RP_ID`, `RP_ORIGIN`, `CORS_ORIGINS`, certbot/CERTBOT domains) must use the hyphenated spelling.

## 3. Migration plan: Turbify → Cloudflare (execute only post-approval)

1. **Inventory first**: in Turbify's DNS panel, screenshot/export every existing record for `ingenious-network.com` (MX for email, www, root A, etc.). Missing one breaks that service after the move.
2. Create a free Cloudflare account (with 2FA), "Add site" → `ingenious-network.com`. Cloudflare auto-imports most records — **verify against the inventory manually**, especially MX (email) records.
3. Cloudflare shows two nameservers. In the **domain registrar** panel (where the domain is registered — likely Turbify), replace the nameservers with Cloudflare's.
4. Wait for "Active" (minutes to 24 h). **Nothing about the existing website/email changes** if the records were copied faithfully — this step only moves record-keeping.
5. Only later, at deployment: add the DWES records (Option C):
   - `dwes` → CNAME → Cloudflare Pages project (proxied)
   - `api.dwes` → CNAME → Railway service domain (proxied) — *only if* the CORS variant is chosen; the Worker-proxy variant needs no extra record
6. **Cutover discipline**: set TTL low (300 s) before any switch; verify the new target answers on a temporary hostname first; keep the old record value written down for instant rollback.

## 4. TLS specifics per component (Option C)

| Hop | Certificate | Renewal | Your action |
|---|---|---|---|
| Browser → Cloudflare edge | Cloudflare Universal SSL | automatic | none — but set SSL mode to **Full (strict)** in Cloudflare, never "Flexible" |
| Cloudflare → Pages/Railway | provider-managed origin certs | automatic | none |
| API → Neon Postgres | Neon enforces TLS (`sslmode=require`) | automatic | keep `sslmode=require` in `DATABASE_URL` |
| HTTP → HTTPS redirect | Cloudflare "Always Use HTTPS" toggle | n/a | switch it on once |

For the VPS branch (Option D) only: certbot/Let's Encrypt as already scripted (`infra/docker/docker-compose.yml` certbot service + renewal cron per the H2 audit fix, `CHANGELOG.md:82`); verify renewal with `certbot renew --dry-run` and calendar-check 60 days after go-live.

## 5. Verification checklist (post-cutover)
- `https://dwes.ingenious-network.com` loads with a valid padlock; `http://` redirects to `https://`.
- SSL Labs (ssllabs.com/ssltest) grade A or better.
- Passkey login works (proves RP_ID/domain correctness).
- Email on the root domain still works (MX untouched).
- Certificate-expiry alerting on (Cloudflare notifications + free UptimeRobot SSL monitor as backstop).
