# DWES File-Storage Architecture & Migration Guide

**Date: 2026-07-13.** Design document only — **no storage code exists yet** (verified: zero S3/R2/minio/supabase references in the repo) and none is written until the architecture is approved.

## When this migration is required

| Chosen architecture | Primary uploads location | Object storage role |
|---|---|---|
| Option C (recommended) / A / D — volume-capable host | **Stays on disk exactly as today** (`UPLOAD_DIR` volume) — zero code change | **Backup/DR target only** (nightly copies) |
| Any ephemeral host (Option B pilot, Cloud Run, etc.) | **Must move to object storage before real data** | Primary store |

DWES's current design is disk-native and well-built: keep it wherever a persistent volume exists. Migrate the primary store to S3-compatible object storage only when (a) the host is ephemeral, (b) uploads outgrow affordable volumes, or (c) multi-instance scaling is needed. The SQLite auth store is **out of scope** for object storage — it needs a real disk (or an approved redesign) regardless.

## Current implementation (what any migration must preserve)

Evidence: `backend/src/frames/frame-store.ts`, `backend/src/upload/upload.service.ts`, `backend/src/frames/frames.controller.ts`, `backend/prisma/schema.prisma` (`file_hashes`).

- **Layout:** `uploads/<PROJECT_CODE>/frames/<frameId>.{json,xlsx}` · `…/drawings/<drawingId>_<original>` + `<drawingId>.meta.json` + `<pkgId>.package.json` · `…/director-reports/<reportId>_<original>` · `uploads/backups/…` (archive-on-replace/delete)
- **Validation:** extension allow-lists per kind (2D: pdf/dwg/dxf/images; 3D: glb/gltf/step/stp/ifc/obj/fbx/stl; schedules: xlsx/xls; director reports: PDF only), MIME cross-check, **magic-byte signature checks** (`hasBasicSignature()`), 50 MB multer cap (memory storage)
- **Integrity/audit:** SHA-256 per upload → `file_hashes` table + drawing `.meta.json` (`sha256`, `uploaded_by`, `kind`); versioned drawing packages (`revision`); archive-on-replace instead of destructive overwrite
- **Access control:** files are **never served statically** — every byte flows through JWT-guarded controllers with role + technician-assignment checks (`frames.controller.ts:243-352`)

This is already most of the Phase-5 requirement list. The migration's job is to relocate bytes, not redesign semantics.

## Target design (S3-compatible, provider-neutral)

### Bucket & key layout (mirrors disk 1:1)
```
bucket: dwes-files (PRIVATE — no public access, no r2.dev/public URL)
  <PROJECT_CODE>/frames/<frameId>.json
  <PROJECT_CODE>/frames/<frameId>.xlsx
  <PROJECT_CODE>/drawings/<drawingId>_<original>
  <PROJECT_CODE>/drawings/<drawingId>.meta.json
  <PROJECT_CODE>/drawings/<pkgId>.package.json
  <PROJECT_CODE>/director-reports/<reportId>_<original>
  _archive/<same-sub-path>/<timestamp>_<name>     ← archive-on-replace
bucket: dwes-backups (PRIVATE — nightly dumps/tars, lifecycle 30 days)
```
A 1:1 key mapping keeps `FrameStore` logic intact and makes rollback to disk a plain `aws s3 sync` in reverse.

### Access pattern: authenticated proxy (chosen) vs signed URLs
- **Chosen: authenticated proxy.** Controllers keep streaming bytes as today, reading from the storage SDK instead of `fs`. Preserves the existing RBAC/assignment checks verbatim, keeps a single audit chokepoint, never exposes bucket URLs. Cost: API bandwidth ~doubles per download (bucket→API→user) — trivial at DWES scale, and $0 egress on R2.
- **Alternative (later, if downloads grow):** short-lived signed GET URLs (60–300 s) issued *after* the same authorization checks. Faster for very large files; slightly weaker audit (link shareable for its lifetime). Not needed at 5–15 users.
- **Uploads** stay proxied through the API in both variants — the magic-byte/MIME/SHA-256 pipeline must keep running server-side. (Direct-to-bucket presigned PUT would bypass validation; rejected.)

### Requirement mapping (user's Phase-5 checklist)
| Requirement | How met |
|---|---|
| Wiring schedules / PDFs / 2D / 3D / reports / exports | same key layout per kind, validation table unchanged |
| File versions & replacement history | existing package `revision` + `_archive/` prefix (from archive-on-replace) |
| Project folders / panel ownership | `<PROJECT_CODE>/` prefix + panel scoping already in metadata & controllers |
| Secure download/view | JWT-guarded proxy (above); bucket has zero public access |
| File-size limits | 50 MB multer cap unchanged |
| MIME + signature validation | existing `upload.service.ts` pipeline unchanged |
| Malware scanning | not built-in at these providers' free tiers; practical option: ClamAV sidecar or an async scan step — documented as residual risk (see SECURITY_AUDIT.md); mitigations: strict signature checks (exist), no server-side execution of uploads, `Content-Disposition: attachment` |
| File hashes | SHA-256 → `file_hashes` + `.meta.json` (exists); becomes the migration-verification tool too |
| Upload audit records | `session_log`/`tech_audit_log` + metadata `uploaded_by` (exists) |
| Retention rules | bucket lifecycle: `_archive/` 180 d, `dwes-backups` 30 d (configurable) |
| Backup/replication | nightly cross-copy `dwes-files` → second provider (R2→B2 via rclone) if required; at minimum versioning ON |
| Never a public bucket | hard rule: no public ACL, no `r2.dev` domain, no `*` CORS on buckets |

### Provider choice for object storage
| | Cloudflare R2 | Backblaze B2 | Supabase Storage | Provider-native (OCI/AWS/…) |
|---|---|---|---|---|
| Free | 10 GB + generous ops | 10 GB | 1 GB (free plan) | varies |
| Egress | **$0 always** | free ≤3× storage | counted (5 GB free) | billed |
| S3 API | ✔ | ✔ | partial (own API preferred) | ✔ |
| Verdict | **Primary choice** | DR/second copy | only if all-in on Supabase | only if already on that cloud |

Both R2 and B2 keep DWES in the free band for years (live files ≈ 17 MB, growth ~50–200 MB/mo).

## Code changes required (post-approval; NOT in this task)

Small and contained — `FrameStore` is already the single chokepoint for disk I/O:
1. Add a storage driver interface (`readFile/writeFile/list/delete/move`) with two impls: `LocalDiskDriver` (current behavior, default) and `S3Driver` (via `@aws-sdk/client-s3` — **new dependency, needs approval**), selected by env (`FILE_STORAGE=local|s3`, plus `S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY` — values user-entered, never generated/committed).
2. `FrameStore.loadAll()` boot-rehydration must list keys instead of directories (or, better, lazily read on demand — a behavior change to flag).
3. Keep multer memory storage; after validation, `put` instead of `writeFileSync`.
No schema changes; no changes to controllers' authorization logic.

## Migration procedure (when triggered)

1. **Freeze** uploads (maintenance window; admin announcement).
2. **Inventory + hash:** walk `uploads/`, compute SHA-256 per file, write `migration-manifest.json` (the `file_hashes` table and `.meta.json` files cross-check it).
3. **Copy:** `rclone copy uploads/ r2:dwes-files/ --checksum` (or `aws s3 sync --endpoint-url …`). rclone verifies hashes in transit.
4. **Verify:** re-list bucket, compare count + SHA-256 against manifest — **zero tolerance**; any mismatch re-copies.
5. **Cut over:** set `FILE_STORAGE=s3` env on the API, restart, smoke-test: upload one file per kind, download one existing drawing per role, replace a drawing (archive path), delete (archive path).
6. **Keep the disk copy read-only for ≥30 days** (rollback = flip env back). Never delete the local originals until the cloud deployment has passed `FINAL_DEPLOYMENT_CHECKLIST.md`.

## Explicit non-goals
- No public buckets, ever (confidential engineering drawings).
- No presigned-upload bypass of server-side validation.
- No SQLite-in-bucket (WAL SQLite cannot run on object storage).
- No provider-proprietary storage APIs where an S3-compatible call exists (portability, per Phase 8).
