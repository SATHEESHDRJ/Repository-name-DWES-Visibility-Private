# LIVE TB — Final acceptance record (real drawing)

**Date:** 2026-08-04  
**Environment:** Local OCI restore only (`DWES_LIVE_TB_BASELINE=0`)  
**Commit / push / production deploy:** none

## Pipeline gates (unchanged — do not regress)

| Gate | Result |
|------|--------|
| Hybrid searchable/OCR pipeline | PASS (implemented) |
| OCR + view classification safety | PASS (`ocr_worker_path`, `ocr_dpi=400`, `ocr_pages=2`, `ocr_post_classified_views`) |
| False HIGH / invented coordinates | BLOCKED |
| Baseline fixtures as proof | Not used (`DWES_LIVE_TB_BASELINE=0`) |

## Checklist proof chain (gates 1–8)

See [LIVE-TB-FINAL-ACCEPTANCE-CHECKLIST.md](./LIVE-TB-FINAL-ACCEPTANCE-CHECKLIST.md).

| Gate | Panel 001 `E01_R1` | Qualifying Internal/Rear GA |
|------|--------------------|-----------------------------|
| 1 Excel headers | PASS (26 expected) | — |
| 2 Text/OCR hit | PASS (legend hits only) | — |
| 3 Eligible view | **FAIL** (legend/BOM) | — |
| 4 Cross-verify HIGH/MEDIUM | **FAIL** (`SCHEDULE_DRAWING_MISMATCH`, high=0, medium=0) | — |
| 5 ACTIVE TB_GROUP | N/A | — |
| 6 Match → red/blue overlay | N/A | — |
| 7 Wire state preserved | N/A | — |
| 8 Baseline=0 | PASS | PASS |

**Overall:** **BLOCKED (corpus)** — acceptable stop condition per plan.

## Corpus inventory

| Asset | Finding |
|-------|---------|
| Active drawings under `/app/uploads/*/drawings` | **Only** `001/.../E01_R1.pdf` |
| Project `001` / `frame_1785319116166_0_wcplt` | Legend-only schedule TBs — see [LIVE-TB-PANEL001-REDIAG.md](./LIVE-TB-PANEL001-REDIAG.md) |
| Project `002` | Frames + Excel present; **no** `drawings/` GA PDF |
| Backup `33kV BUSBAR PROTECTION PANEL (_H00+R).pdf` | 37 pages, **no searchable text** (image/scanned); not bound to a matching schedule/frame for acceptance; not used as fixture proof |

No user-provided Internal/Rear GA with schedule-aligned physical TB banks was available in this restore.

## Stop condition applied

**Blocked (acceptable for this corpus):** only legend-only (or unbound/scanned) GAs available.

- Auto physical mapping for available panels: **N/A**
- Pipeline / safety: **PASS**
- Schedule–drawing mismatch on panel 001: **honest FAIL** (not a detection crash)
- Legend rejection: **kept** (no loosening)

## Unblocked path (when a qualifying GA exists)

1. Upload GA where schedule headers appear as Internal/Rear / `PHYSICAL_TB_BANK` strips (real OCR/text boxes).
2. Re-run analysis with `DWES_LIVE_TB_BASELINE=0`.
3. Expect ACTIVE HIGH groups, or MEDIUM + Supervisor confirm **only** with existing geometry.
4. Technician Match → Source red `#dc2626` / Dest blue `#2563eb` (same-header red+blue ring).
5. Record gates 1–8 on that panel; still no fixtures.
