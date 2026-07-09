---
name: dwes-db-guard
description: Enforces DWES data-integrity rules before any task that could touch a database, schema, file-store, or data column. Use when the task mentions database, DB, Postgres, WiringSchemeDB, Prisma, schema, migration, migrate, db push/pull, SQL, query, seed, column, table, model, frames, drawings, uploads, session_log, cable progress, project code, or any shell command that could mutate data. Trigger proactively whenever data could be read or written — when in doubt, trigger.
paths:
  - backend/**
  - backend/prisma/**
  - scripts/**
---

# DWES DB Guard

Surface and enforce all non-negotiable data-integrity rules **before** beginning work. This skill is a gate, not a suggestion.

---

## Step 1 — Read current schema state

Before touching any data-related code, read the Prisma schema to confirm actual column names:

```
Read: backend/prisma/schema.prisma
```

Never rely on memory for column names — always verify against the schema file.

---

## Step 2 — Surface the hard rules (recite these to yourself before proceeding)

### WiringSchemeDB is read-only for schema purposes
- `prisma db pull` is the ONLY allowed Prisma command against WiringSchemeDB
- **NEVER** run `prisma migrate`, `prisma db push`, `prisma generate` followed by migration, or any DDL (ALTER TABLE, CREATE TABLE, DROP, etc.) against WiringSchemeDB
- App code adapts to existing DB columns — **the DB never changes to fit the code**

### Fixed column mappings (use these names; never invent synonyms)
| Logical concept | Actual DB column |
|-----------------|-----------------|
| inspection result | `overall_result` |
| ferrule / markup check | `redmarkup_check` |
| notes / comments | `inspection_notes` |

### session_log has no `user_name` column
- Getting a user's name from session_log requires a JOIN: `session_log JOIN users ON session_log.user_id = users.id`
- Never query `session_log.user_name` — the column does not exist

### Frames and drawings are FILES, not DB rows
- Physical location: `uploads/<PROJECT_CODE>/frames/` and `uploads/<PROJECT_CODE>/drawings/`
- **Never** query a `frames` table or `drawings` table in WiringSchemeDB — they do not exist
- File existence is checked on disk via the filesystem, not via SQL

### Cable progress formula
```
progress_pct = (cables_src_done + cables_dst_done) / (cables_total * 2) * 100
```
Never use any other formula. If `cables_total` is 0, guard against division by zero.

### Project code format
```
PANELTYPE_VOLTAGE_REGION_LOCATION_YEAR_SEQ
```
`SEQ` is zero-padded to 3 digits (e.g. `001`, `012`, `100`). Always validate against this pattern when parsing or generating project codes.

### The ONE writable datastore the app may create/migrate
`backend/data/dwes_auth.sqlite` (WebAuthn credential store) is **not** WiringSchemeDB.
- Schema migrations against `dwes_auth.sqlite` using `better-sqlite3` are allowed
- This exemption applies to `dwes_auth.sqlite` ONLY — no other SQLite or Postgres database
- `production_bootstrap` table in the same SQLite file tracks post-cutover password/WebAuthn requirements

### OCI production Postgres (WiringSchemeDB data, not schema)
- Data directory: `/mnt/dwes-data/postgres` on the VM (Docker bind mount)
- Cutover restore: `infra/oci/scripts/migrate-db.sh` with `pg_restore --clean` — **HARD STOP** unless user approved cutover
- No `prisma migrate` on OCI — tuning only via `infra/docker/postgres/postgresql.conf`

---

## Step 3 — Check for HARD STOP conditions

Before running ANY of the following against WiringSchemeDB, **STOP and report to the user**:

- Any `INSERT`, `UPDATE`, or `DELETE` SQL statement
- `prisma migrate`, `prisma db push`, `prisma db seed`
- Any DDL: `ALTER TABLE`, `CREATE TABLE`, `DROP TABLE`, `TRUNCATE`
- Direct `psql` or `pg_dump --restore` commands that modify data
- Any ORM method that writes: `.create()`, `.update()`, `.upsert()`, `.delete()`, `.deleteMany()`  
  *(exception: the existing app write paths already approved in code — e.g. updating `last_login`, inserting `session_log` rows — these are pre-approved)*

**HARD STOP script:**
1. State exactly what command/query you were about to run
2. State which table(s) and column(s) would be affected
3. State the expected row count or impact
4. **Wait for explicit approval** in the chat before proceeding
5. Do not proceed on timeout or ambiguous response — ask again

---

## Step 4 — Verify PROGRESS.md for active context

```
Read: PROGRESS.md
```

Check:
- What module is currently active?
- Are there any data-related pending tasks noted?
- Is the WebAuthn SQLite store (dwes_auth.sqlite) relevant to the current task?

---

## Step 5 — Proceed with the task

Once all rules are loaded and no HARD STOP is triggered, proceed with the original task.

Keep these rules active throughout the task session. Re-surface any relevant rule the moment a data operation approaches.

---

## Quick-reference cheatsheet

```
✅ ALLOWED                        ❌ NEVER (without approval)
─────────────────────────────     ─────────────────────────────────────
prisma db pull                    prisma migrate / db push
SELECT queries (read)             INSERT / UPDATE / DELETE (WiringSchemeDB)
READ schema.prisma                ALTER / CREATE / DROP TABLE
Check files on disk               Query nonexistent frames/drawings table
Write to dwes_auth.sqlite         Modify WiringSchemeDB schema in any way
Use: overall_result               Use: result, outcome, verdict
Use: redmarkup_check              Use: ferrule_check, markup_check
Use: inspection_notes             Use: notes, comments
JOIN users for names              Query session_log.user_name (doesn't exist)
(src_done + dst_done)/(total*2)   Any other cable-progress formula
```
