# LIVE ENDPOINT + Prep Report — Multi-PDF matrix & acceptance

**Date:** 2026-09-19  
**Overall PASS:** **YES** — drawing mapping (searchable / scanned / hybrid) and real preparation reporting both have browser + API evidence. Original `003` GA restored after hybrid mount.

## Drawing types

| Class | Project / artifact | Text layer | Match evidence | Browser overlay |
|-------|--------------------|------------|----------------|-----------------|
| **Searchable** | `001` E01_R1.pdf (`3cd70ab1…`) | 2/2 pages | Wire **021/D1** → `87STUB` + `QDC1` unmatched=false (`wire-021-d1-match-probe.json`) | **PASS** `wire-021-d1-browser-both-boxes.png` (red `SRC · 87STUB` + blue `DST · QDC1`) |
| **Scanned (non-searchable)** | `003` SIET-4 Solar Wadi GA (`b52f477d…`) | 0/7 pages | Wire **20.16:E** → `H74` + `KF87L` page 6 | **PASS** `wire-2016e-browser-both-boxes.png` |
| **Hybrid** | live-mounted then restored; artifact `hybrid_searchable_plus_scanned_ga.pdf` (`292db173…`, 1/2 text) | 1/2 pages (HYBRID) | Match on remapped page 2 (`hybrid-live-match-probe.json` lineage + live mount) | **PASS** `hybrid-live-browser-both-boxes.png` (red `SRC · H74` + blue `DST · KF87L`; directory not boxed) |

## Visual rules (accept)

- One red box around physical Source group / device (`SRC · H74`)
- One blue box around physical Destination (`DST · KF87L`)
- Right-side LEGEND / directory **not** boxed
- FRONT peer maps rejected from auto-paint
- Wire **021/D1** regression preserved

## FINISHED auto-advance

- LIVE stayed open; Wire `20.16:E` → `20.16:F` rematch without PDF remount
- Evidence: `wire-2016f-after-finished-advance.png`
- SSE / cable-action returns `previous_wire_id` + `next_wire_id`

## Real preparation reporting

Wire index 16 (assignment 72) full chain:

| Stage | Status | Actor | Evidence |
|-------|--------|-------|----------|
| Cut | COMPLETED | Vineesh Mon Vijayan | `prep-cut-strip-crimp-finish-evidence.json` |
| Strip (wire) | COMPLETED | same | + audit `WIRE_CUT` / `SRC_STRIPPED` |
| Crimp SRC+DST | COMPLETED | same | `wireCrimp=COMPLETED`, `SRC_CRIMPED` / `DST_CRIMPED` |
| Ready for Wiring | true | — | readiness after both ends + cut/strip |
| Wiring Finished | True/True | same | `WIRING_FINISHED` |

**No FINISHED backfill:** Wire 10 (earlier FINISH without prep) still `cut=null`, `strip=NOT_STARTED`, wiring True/True, audit only `WIRING_FINISHED`.

## Analysis lifecycle

- Panel `003` OCR pipeline: `TECHNICAL_FAILURE` with real reason
- Technician chip: `FAILED — Automatic TB-location analysis failed. Verified physical mappings still display when available.`
- Manual maps still paint endpoints

## Restore after hybrid mount

- Original drawing restored: `drw_b2c17e4b…` / `b52f477d…`
- Manual maps restored to page 6; post-restore Match: H74 + KF87L unmatched=false on page 6
- Evidence: `hybrid-live-browser-evidence.json`

## Artifact index

- `wire-2016e-browser-both-boxes.png`
- `wire-2016f-after-finished-advance.png`
- `wire-2016e-match-probe.json`
- `wire-021-d1-browser-both-boxes.png`
- `prep-cut-strip-crimp-finish-evidence.json`
- `hybrid-pdf-classification.json`
- `hybrid-live-browser-both-boxes.png`
- `hybrid-live-browser-evidence.json`
- `WIRE_2016E_MAPPING_STATUS.md`
