# Continuous Project Improvement Review (CPI)

Mandatory read-only review that runs **after** the user's requested task is complete and verified, **before** the final response. Analyze only what you can verify in the current DWES codebase. Never invent recommendations.

---

## When to run

Run CPI when **all** of the following are true:

1. The user's requested task is complete (or blocked with a clear, verified reason).
2. Task verification steps from the main skill are done (e.g., `npm run build` for UI work).
3. You have identified the **affected modules** — files, folders, endpoints, configs, or docs touched or directly related to the task.

**Skip CPI** only when the interaction is purely informational (no implementation, no repo inspection beyond answering a single fact) and no modules were analyzed. State that CPI was skipped and why.

---

## Verification protocol (read-only)

Before writing any finding or recommendation:

1. **Read** affected source files, configs, or docs — do not rely on memory or prior sessions.
2. **Search** the codebase (`Grep`, `Glob`, or MCP `dwes-filesystem`) to confirm duplicates, unused symbols, or pattern drift.
3. **Cite evidence** — file path, line range, symbol name, config key, or command output.
4. If a dimension cannot be verified (file missing, service unreachable, scope unclear), move it to **Needs Confirmation** — never guess.

**Prohibited during CPI:**

- Implementing improvements the user did not request.
- Modifying business logic, workflows, database schema, APIs, or production behavior.
- Recommending new dependencies, frameworks, or external patterns without verified gap + user-approval path.
- Stating issues without codebase evidence.

---

## Review dimensions

Evaluate only dimensions **relevant to affected modules**. For each, either record a verified finding or omit it (do not list "checked, OK" per dimension unless summarizing under **No Issues Found**).

| Dimension | Verify by |
|-----------|-----------|
| Architecture | Layer boundaries (UI → `api.ts` → NestJS → Prisma/file store), module coupling |
| Folder structure | Placement vs existing conventions in sibling modules |
| Code quality | Naming, complexity, error paths, type safety in touched files |
| Reusable components | Duplication vs `src/components/ui/`, hooks, utilities |
| UI/UX consistency | `design-system.css`, `tokens.css`, `themes.css`, sibling screens |
| Alignment, spacing, typography | CSS tokens and existing dashboard/modal patterns |
| Icons | `named-icons.tsx` barrel rule; no JSX in barrel `index.tsx` |
| Color system | Theme tokens / palette usage in touched UI |
| Responsiveness | Layout behavior in touched components |
| Accessibility | Labels, focus, semantics in touched UI |
| Performance | Obvious N+1, polling, bundle impact in touched code |
| Database usage | `schema.prisma` column names; read-only WiringSchemeDB rules |
| API design | Route naming, auth, shapes vs sibling controllers |
| Error handling | Project patterns (exceptions, toasts) in touched paths |
| Logging | Existing logging mechanisms vs ad-hoc `console` |
| Security | JWT, validation, secrets in touched endpoints/forms |
| Backup strategy | `scripts/backup.ps1`, change-management restore points |
| Startup process | `scripts/launch*.mjs`, `Start DWES*.cmd` if task touched ops |
| Git workflow | Branch/CHANGELOG/PROJECT_STATUS alignment per change-management |
| Cursor configuration | `.cursor/rules`, `.cursor/skills`, `mcp.json` if task touched them |
| VS Code configuration | `.vscode/*` if task touched editor config |
| Documentation | `README.md`, `CHANGELOG.md`, `PROJECT_STATUS.md` accuracy |
| Testing | Existing tests in `backend/test/`, manual verification gaps |
| Deployment readiness | `deployment-config.ts`, env patterns if relevant |
| Technical debt | Verified shortcuts or TODOs in affected files |
| Duplicate code | Grep-confirmed repeated logic across modules |
| Obsolete files | Dead files still referenced or orphaned in affected area |
| Unused dependencies | `package.json` / `backend/package.json` imports vs declared deps |
| Maintainability | Readability and extension cost of touched modules |

Pair with specialist skills when relevant: `dwes-db-guard` (data), `dwes-reports-backup` (reports/backup/wiring).

---

## Recommendation record format

Every item in **Verified Improvements** or **Recommended Future Improvements** must use this structure:

```markdown
### [ID] Short title
- **Severity:** Critical | High | Medium | Low | Optional
- **Dimension:** (from table above)
- **Affected files/modules:** `path/to/file` (and siblings)
- **Evidence:** What you read/searched; cite paths/lines or command output
- **Technical justification:** Verified technical reason
- **Business justification:** Verified impact on DWES users, ops, or data safety
- **Implementation effort:** Small (<1h) | Medium (1–4h) | Large (>4h) | Unknown (state why)
- **Potential impact:** What improves if addressed; what risk remains if not
```

**Severity guide (apply only with evidence):**

| Severity | When |
|----------|------|
| Critical | Data loss, security hole, production breakage, or WiringSchemeDB integrity risk |
| High | Incorrect behavior, major inconsistency, or significant maintainability block |
| Medium | Clear quality or consistency gap with manageable fix |
| Low | Minor polish, docs, or non-blocking consistency |
| Optional | Nice-to-have; no verified functional or safety impact |

---

## Project Improvement Report template

Append this report as the **final section** of the task response (after Implemented Changes summary). Use exact section headings.

```markdown
---

## Project Improvement Report

### Implemented Changes
- Bullet list of what was done for the user's request (files, behavior, verification run)

### Verified Improvements
- Recommendations already backed by evidence in the current codebase (use Recommendation record format)
- Or: *None identified in affected modules.*

### Recommended Future Improvements
- Evidence-backed opportunities **not** implemented (user did not request; use Recommendation record format)
- Or: *None identified in affected modules.*

### Needs Confirmation
- Items that could not be verified from the project alone; state what is missing and ask a specific question
- Or: *None.*

### No Issues Found
- Brief list of dimensions reviewed in affected modules where no verified issue was found
- Or: *No affected modules reviewed* (if CPI skipped)
```

**Classification rules:**

- **Verified Improvements** — issue or opportunity confirmed in code; may overlap with work done if the task itself fixed a verified problem.
- **Recommended Future Improvements** — confirmed opportunity; **do not implement** unless the user explicitly requests it in a follow-up.
- **Needs Confirmation** — insufficient access, ambiguous scope, or missing file/service; **no recommendation**, only a clarification request.
- **No Issues Found** — positive confirmation only for dimensions actually checked; do not claim project-wide health from a narrow task.

---

## Response discipline

- Prefer fewer, evidence-dense recommendations over a long speculative list.
- When zero issues exist in scope, say so under **No Issues Found** rather than padding.
- If the task was blocked, still run CPI on whatever was verified before the blocker.
- CPI does not replace `CHANGELOG.md` / `PROJECT_STATUS.md` updates — those remain per change-management when code changed.
