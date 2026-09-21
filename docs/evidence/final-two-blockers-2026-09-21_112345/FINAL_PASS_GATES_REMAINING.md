# Final PASS — remaining gates (after two-blocker remediation)

**Two-blocker scope (items 1–2 in `FINAL_TWO_BLOCKERS_REPORT.md`): closed with evidence on local restore.**  
**Product Final PASS: NO-GO** until all rows below are satisfied.

| Gate | Owner / authority | Evidence when done | Current state |
|------|-------------------|--------------------|---------------|
| Unseeded LIVE TB AUTO/HIGH | Engineering + drawing supplier | Match UI: both ends AUTO/HIGH on eligible INTERNAL\|REAR page; quarantine MANUAL_MAP | **BLOCKED** — see [`docs/ACCEPTANCE_DRAWING_REQUIRED.md`](../../ACCEPTANCE_DRAWING_REQUIRED.md) |
| Security (no middie critical/high, no owner waiver) | Engineering | `verify/SUMMARY.txt`, `security/MIDDIE_NEST11_CLOSURE.md` | **MET** on restore (`security/nest11-fastify5`) |
| Satheesh overall UI acceptance | Satheesh | Exported gallery summary + explicit “overall approve” in writing | **PENDING** — `ui/OWNER_REVIEW_GALLERY.html` (26 PNGs) |
| Remote CI | Repo admin (push/PR authority) | Green GitHub Actions run on the merge candidate | **BLOCKED** — branch on origin @ **`953f153f`**; runs **35589801505–35590400702** failed: *account locked due to billing* (0 job steps). Local mirror: **CI_LOCAL_PARITY_PASS**. Unblock billing → re-run workflow. |
| Production deploy | Separate prod authority | Signed deploy record (out of scope here) | **NOT AUTHORIZED** |

## Satheesh — UI re-review (≈5 min)

1. Open `ui/OWNER_REVIEW_GALLERY.html` in Chrome/Edge (file:// or via nginx if copied to a served path).
2. Review all **26** cards (includes `status-chips-1440` on Supervisor Status tab).
3. Approve/Reject per card; add comments where needed.
4. Click **Build summary** in the footer; save the pre block as `ui/OWNER_DECISION_EXPORT_REREVIEW.json` or paste into email/Teams.
5. Record **explicit overall acceptance** (one line: “Overall UI/UX APPROVED for restore candidate …”) — partial card counts alone are not Final PASS.

Credentials (restore): `tech3`/`tech3`, `supervisor1`/`super123`, `ops_director1`/`ops_director123`, `qa1`/`qa1`, `sysadmin`/`admin123`.

## Remote CI — when authorized to push

**Local preflight (2026-09-21):** all four workflow jobs mirrored — FE/BE tests (`ci-local-parity-nest11.txt`), audit high gate (exit 0), API `docker build` (`docker-api-build-nest11.log`). Remote run still required for Final PASS.

1. Push branch **`security/nest11-fastify5`** (now matches `ci.yml`) or open PR from **`change/nest11-fastify5`**. (`gh` CLI not on this machine — use GitHub web or install `gh` for run URLs.)
2. Confirm workflow **DWES CI (local validation)** is green (frontend + backend + security + container-api).
3. Attach run URL to this evidence folder or release record.

## Re-run local verification (Nest11 restore)

```powershell
cd 02_GIT_PRODUCTION_SOURCE/DWES
$env:DWES_API_URL='http://127.0.0.1:3101'
$env:DWES_UI_URL='http://127.0.0.1:5275'
npm --prefix backend test
node scripts/verify-final-two-blockers-restore.mjs
node scripts/verify-browser-restore-smoke.mjs
```

Restore UI: http://127.0.0.1:5275 · API: http://127.0.0.1:3101/api/health
