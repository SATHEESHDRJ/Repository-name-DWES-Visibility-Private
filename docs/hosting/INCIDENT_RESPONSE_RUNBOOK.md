# DWES Incident Response Runbook

**Date: 2026-07-13.** For a one-administrator operation: every play is written to be executable under stress by one person. Severity: **SEV-1** = production down or data at risk · **SEV-2** = degraded (slow, partial) · **SEV-3** = cosmetic/deferred.

## First 5 minutes — always the same
1. Confirm scope: open `https://dwes.ingenious-network.com` and `/api/health` from a phone (off the office network — distinguishes app-down from office-internet-down).
2. Check provider status pages: cloudflarestatus.com · status.railway.com (or chosen host) · neonstatus.com.
3. Check the platform dashboards' logs for the API service (crash loop? OOM? deploy event?).
4. Note the time and what you see — the post-incident log (§ bottom) starts now.

## Play 1 — API down / crash-looping (SEV-1)
- Recent deploy? → **roll back to the previous build** (platform one-click). Root-cause later, on staging.
- OOM in logs (heap/137 exit)? → bump service RAM one notch; investigate which upload/parse triggered it afterwards.
- Restart-safe by design: the app rehydrates from disk/DB on boot (`main.ts:157`); only in-flight passkey ceremonies are lost (users retry).

## Play 2 — Database unreachable (SEV-1)
- Neon status page first; then Neon dashboard (compute suspended? limit hit? — free-tier limit exhaustion suspends until next month: upgrade the plan to resume immediately).
- Connection-string/secret rotated accidentally? Compare env var name inventory (never values) against the dashboard.
- Worst case: restore latest dump into a fresh DB/branch and repoint `DATABASE_URL` (`BACKUP_AND_RESTORE_RUNBOOK.md` §3) — this is the RTO-critical path, rehearsed quarterly.

## Play 3 — Domain / TLS failure (SEV-1 if login broken)
- Padlock errors: Cloudflare dashboard → SSL mode must be **Full (strict)**; check certificate status on the Pages custom domain.
- **Passkeys suddenly failing for everyone** = domain/RP_ID mismatch — check that no config/deploy changed `RP_ID`/`RP_ORIGIN` or served the app from a different hostname (`SECURITY_AUDIT.md` G9). Password login keeps working meanwhile — announce that as the workaround.
- DNS mistake: restore the previous record value from the DNS inventory (TTL 300 ⇒ ≤5 min).

## Play 4 — Suspected credential/token compromise (SEV-1)
1. Rotate `JWT_SECRET` in the platform dashboard + restart → **every access token is instantly invalid**.
2. Revoke all refresh tokens (delete rows via the SQLite store admin path, or restore an empty token table) → all sessions forced to re-login.
3. Reset the affected user's password (admin UI); check `session_log` for the account's recent logins (JOIN users for names — remember `session_log` has no `user_name`).
4. Rotate any platform credential that may have leaked (Railway/Neon/Cloudflare API tokens, R2 keys). All values re-entered by the administrator; never posted anywhere.
5. Review `tech_audit_log`/`session_log` for actions taken during the exposure window; document.

## Play 5 — Data loss / bad bulk operation (SEV-1)
- STOP writes (pause the API service) before anything else — preserves the blast radius.
- Minutes ago: Neon PITR/branch restore of the DB. Files: restore from last nightly tarball (anything uploaded since is gone — check `file_hashes` timestamps to enumerate).
- Never restore over the only copy: restore *beside*, verify, then swap.

## Play 6 — Provider outage or account lock (SEV-1/2)
- Outage: if status page confirms, wait it out (single-region tradeoff accepted in `SECURITY_AUDIT.md` §4.3); communicate ETA to the team.
- Account lock/billing suspension: this is why Layer-2 backups are **off-provider** (R2) and weekly copies land on the office PC. Recovery = full-provider-loss play in the backup runbook (≈1–2 h to any Docker host).
- **The local Windows deployment remains functional during the transition period** — for a prolonged cloud outage before decommissioning, fall back to LAN operation.

## Play 7 — Storage full (SEV-2)
- Railway volume: grow it (dashboard) or prune `uploads/backups/` archives per retention (`FILE_STORAGE_MIGRATION_GUIDE.md`); R2: check lifecycle rules ran.

## Communication template (to Director/team, plain language)
> DWES is currently unavailable/degraded since <time>. Cause: <known/under investigation>. Data is safe (last backup <time>). Workaround: <e.g. password login instead of fingerprint / wait>. Next update by <time+1 h>.

## Post-incident (within 48 h, 15 minutes of writing)
Date · duration · user impact · root cause · what fixed it · what prevents recurrence (add to backlog) · did backups/monitoring behave as designed? Append below.

| Date | SEV | Summary | Root cause | Follow-up |
|---|---|---|---|---|
| — | — | — | — | — |
