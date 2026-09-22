# PR draft — `security/nest11-fastify5` → `main`

Use after **GitHub Actions billing is fixed** and **DWES CI (local validation)** is green on the merge candidate.

```text
## Summary

- Nest 11 + Fastify 5 security closure: `@fastify/middie` removed from dependency tree (restore-verified).
- GitHub-pushable restore bundle + full `mock-store.ts` for remote `nest build` parity.
- Final two-blocker evidence: LIVE TB blocked per `docs/ACCEPTANCE_DRAWING_REQUIRED.md` (no detector changes); local gates 426/426 BE, FE typecheck/lint/build, audit high gate, DB workflows, browser smoke.

## Test plan

- [ ] GitHub Actions **DWES CI (local validation)** green (all four jobs).
- [ ] Local optional parity: `scripts/run-ci-local-parity.ps1`
- [ ] Restore stack: `node scripts/verify-final-two-blockers-restore.mjs` + `verify-browser-restore-smoke.mjs`
- [ ] Satheesh overall UI approval (`ui/OWNER_REVIEW_GALLERY.html`) — **not** replaced by CI
- [ ] LIVE TB Final PASS still requires acceptance drawing — **not** in this PR scope

## Out of scope

- Production deploy / OCI apply
- `prisma migrate deploy` on WiringSchemeDB
- Promoting MANUAL_MAP / legend / seeded coords to AUTO/HIGH
```
