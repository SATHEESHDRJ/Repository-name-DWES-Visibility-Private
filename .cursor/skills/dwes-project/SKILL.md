---
name: dwes-project
description: Permanent AI development guide for the Digital Wiring Execution System (DWES) at C:\Users\sathe\OneDrive\Desktop\DWES. Use for every code generation, bug fix, refactor, UI change, feature, or architecture question in this workspace. Triggers proactively on any DWES repo work; runs a Continuous Project Improvement Review after each completed task. Pair with dwes-db-guard for data tasks and dwes-reports-backup for reports/backup/wiring UI.
---

# DWES Project Skill

Canonical artifact: [DWES Project AI Development Guide](https://claude.ai/public/artifacts/619f50f7-029b-43fe-9979-c9e0a295de5b)

## Load order

1. **Repo rule (always apply):** `.cursor/rules/dwes-project-skill.mdc`
2. **Profile:** `.cursor/rules/dwes-profile.mdc`
3. **Change management:** `.cursor/rules/change-management.mdc`
4. **Specialist skills:**
   - `dwes-db-guard` — WiringSchemeDB integrity, HARD STOP on writes/DDL
   - `dwes-reports-backup` — report branding, wiring workstation, `npm run backup`
5. **After every completed task:** [improvement-review.md](improvement-review.md) — Continuous Project Improvement Review (CPI)
6. **OCI production:** `.cursor/rules/oci-production.mdc` + [docs/DWES_ORACLE_CLOUD_DEPLOY_PROMPT.md](../../docs/DWES_ORACLE_CLOUD_DEPLOY_PROMPT.md)

## Non-negotiables

- **Single universe:** Only patterns from this codebase — no external scaffolds.
- **No new deps** without user approval.
- **Smallest diff** — no drive-by refactors.
- **Business logic sacred** — flag behavior changes; preserve workflows, schema, APIs, and production behavior.
- **WiringSchemeDB read-only** — `prisma db pull` only; load `dwes-db-guard` for data work.
- **Discover first** — read `package.json`, similar modules, `schema.prisma`, `api.ts`.
- **CPI is read-only** — never auto-implement improvements the user did not request.

## Quick discovery paths

| Task type | Read first |
|-----------|------------|
| UI / layout | `AppShell.tsx`, `DashboardShell.tsx`, `design-system.css` |
| API | `src/services/api.ts`, matching `backend/src/*/*.controller.ts` |
| DB / data | `dwes-db-guard` → `backend/prisma/schema.prisma` |
| Reports | `dwes-reports-backup` → `backend/src/common/report-branding.ts` |
| Technician wiring | `WiringWorkstation.tsx`, `technician-wiring-workflow.mdc` |

## Task workflow

```
Task Progress:
- [ ] Discovery (Section 2 of dwes-project-skill.mdc)
- [ ] Implement user's requested scope only
- [ ] Verify (build, smoke routes, change-management docs if code changed)
- [ ] CPI — read improvement-review.md; emit Project Improvement Report
```

## Verification

- UI changes: `npm run build` + smoke `/`, `/technician`, one other role route
- After changes: update `CHANGELOG.md` and `PROJECT_STATUS.md` per change-management rule

## Workspace path

`C:\Users\sathe\OneDrive\Desktop\DWES`

## Sync locations

| Copy | Path |
|------|------|
| Project skill (authoritative) | `DWES/.cursor/skills/dwes-project/SKILL.md` |
| CPI reference | `DWES/.cursor/skills/dwes-project/improvement-review.md` |
| Cursor rule (always apply) | `DWES/.cursor/rules/dwes-project-skill.mdc` |
| MCP config | `DWES/.cursor/mcp.json` |
| Agent skill index | `~/.claude/skills/dwes-project/SKILL.md` |
