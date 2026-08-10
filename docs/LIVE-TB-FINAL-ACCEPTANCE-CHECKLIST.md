# LIVE TB — Final real-drawing acceptance checklist

**Scope:** Local OCI restore only. `DWES_LIVE_TB_BASELINE=0`. No fixtures, no inventing coordinates, no commit/push/production deploy.

**Date:** 2026-08-04  
**Pipeline status:** Hybrid searchable/OCR implemented; safety PASS.

## Required proof chain (one qualifying panel)

| # | Gate | Pass criteria | Evidence |
|---|------|---------------|----------|
| 1 | Excel schedule | Expected physical TB headers from typed + `_raw` DEV_TBLK / mapping | `buildExpectedTbHeaders` / analysis `expected_headers` |
| 2 | Text / OCR hit | Nest pdfjs or OCR word box for expected header | Analysis notes / candidates |
| 3 | View class | `INTERNAL_VIEW` / `REAR_WIRING_VIEW` / `PHYSICAL_TB_BANK` only | `view_name` / `view_classification` |
| 4 | Cross-verify | HIGH auto, or MEDIUM + Supervisor confirm **with existing geometry** | `excel-ga-cross-verify` / pending confirm |
| 5 | Persist | ACTIVE `TB_GROUP`, checksum + revision bound, finite bbox | DB / `tb-groups` API |
| 6 | Match → overlay | Source red `#dc2626`, Dest blue `#2563eb`; same-header red+blue ring | Technician LIVE TB VIEW |
| 7 | State preserved | Active wire, filters, pause/resume, corrections unchanged | Manual UI check |
| 8 | Baseline | `DWES_LIVE_TB_BASELINE=0`; no `DEV_BASELINE_FIXTURE` | Env + match exclusions |

## Forbidden

- HIGH from legend/BOM/front/schematic/terminal-diagram only
- Invented or hand-drawn coordinates for Supervisor confirm
- DEV_BASELINE fixtures as acceptance proof

## Stop conditions

- **PASS:** All gates 1–8 on a qualifying Internal/Rear GA.
- **BLOCKED (corpus):** Only legend-only GAs available — pipeline PASS / auto-mapping N/A for those panels.

## Result (2026-08-04 local restore)

**BLOCKED (corpus).** See [LIVE-TB-FINAL-ACCEPTANCE-RECORD.md](./LIVE-TB-FINAL-ACCEPTANCE-RECORD.md) and [LIVE-TB-PANEL001-REDIAG.md](./LIVE-TB-PANEL001-REDIAG.md). Pipeline/safety PASS; panel 001 auto-mapping N/A (legend-only).
