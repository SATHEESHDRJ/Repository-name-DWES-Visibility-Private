# Owner unblock checklist — Final PASS (2026-09-21, resumed 2026-09-22)

**Remote CI (2026-09-22):** still **billing lock** — no runner jobs started (Run 5 @ `2faad03f`). Local restore gates **PASS** today.

Engineering two-blocker remediation is **closed with evidence** on local restore. Product **Final PASS** needs the items below (no agent substitute).

## 1. Remote CI (repo admin)

- [ ] Open [GitHub Billing](https://github.com/settings/billing) and clear **account locked due to billing issue**.
- [ ] Actions → **DWES CI (local validation)** → **Re-run all jobs** on branch `security/nest11-fastify5` @ **`2faad03f`** (or latest).
- [ ] Confirm **green** run (frontend + backend + security + container-api).
- [ ] Record URL in `verify/GITHUB_ACTIONS_RUNS_2026-09-21.txt` (Run 5+).

**Known runs (all failed before start — billing):** `verify/GITHUB_ACTIONS_RUNS_2026-09-21.txt` · latest Run 5: https://github.com/SATHEESHDRJ/Repository-name-DWES-Visibility-Private/actions/runs/35590974779

**Local mirror already PASS:** `scripts/run-ci-local-parity.ps1`, `verify/SUMMARY.txt`

PR (when CI green): https://github.com/SATHEESHDRJ/Repository-name-DWES-Visibility-Private/pull/new/security/nest11-fastify5

## 2. LIVE TB — unseeded AUTO/HIGH (drawing supplier)

- [ ] Supply acceptance drawing per [`docs/ACCEPTANCE_DRAWING_REQUIRED.md`](../../ACCEPTANCE_DRAWING_REQUIRED.md).
- [ ] Both endpoints must appear on eligible **physical** panel views (INTERNAL|REAR); no MANUAL_MAP / legend / seeded coords promoted to AUTO/HIGH.
- [ ] KF87L legend-only pair remains correct **SAFE MISMATCH PASS** until a valid pair exists.

## 3. Satheesh UI (≈5 min)

- [ ] Run `scripts/open-owner-rereview-gallery.ps1` → review **26** cards in `ui/OWNER_REVIEW_GALLERY.html`.
- [ ] Export summary; save explicit **overall UI/UX APPROVED** for restore candidate.

Restore URLs: UI http://127.0.0.1:5275 · API http://127.0.0.1:3101/api/health

## 4. Production

- [ ] **Not authorized** from this thread — separate deploy authority only.

## Not in scope

- No `@fastify/middie` risk acceptance / security waiver (Nest11 path met locally).
- No `prisma migrate deploy` on production WiringSchemeDB.
