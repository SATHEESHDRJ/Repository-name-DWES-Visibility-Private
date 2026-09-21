# DWES LIVE ENDPOINT VIEW — Drawing Header Group Highlight

**Verdict: PASS**  
**Date:** 2026-09-18  
**HEAD:** `949b6806377e01f9b12229f9292f37026133b7b3` (dirty — uncommitted)  
**Branch:** `change/technician-single-wire-matrix-2026-07-27`

## Acceptance case

| Field | Value |
|-------|--------|
| Panel | `=E01_R1` / project `001` |
| Wire | `021/D1` (schedule sno 114 / index 113) |
| Source | `87STUB` / `X420:2` → **RED** header/group rectangle |
| Destination | `QDC1` / `4` → **BLUE** header/group rectangle |
| GA | `/app/uploads/001/drawings/drw_73b1fd8e-be16-448f-b46c-593dee54b0ef_E01_R1.pdf` |

## Phase 0 corpus

| Item | Finding |
|------|---------|
| GA PDF | Present in API container |
| Searchable PDF text for 87STUB/X420/QDC1 | Not found (image/compressed corpus) |
| DB `tb_markers` for those tags | None |
| Resolution path | Supervisor **manual header-group maps** (JSON sidecar, no DDL) on INTERNAL_VIEW page 1 |

Manual maps: `uploads/manual-endpoint-mappings/001/frame_1785319116166_0_wcplt.json`  
Notes: “Supervisor verified header group for LIVE ENDPOINT acceptance — not legend/BOM”

## Implementation

- Pure helpers: [`backend/src/tb-markers/header-group-match.ts`](../../../backend/src/tb-markers/header-group-match.ts)
- Match service: always `paint_mode: header_group`; equipment + manual-map unique-or-fail; reason prefix `Header group not found`
- UI: equipment ends call Match (was blocked by `tb_fields_present === false`); snapshot passes equipment lookup keys as `source_device` / `dest_device`
- Paint: SRC `#dc2626` / DST `#2563eb` group outlines only (no terminal cell)

## Match diagnostics (Wire 021/D1)

File: [`wire-021-d1-match-diagnostics.json`](./wire-021-d1-match-diagnostics.json)

| End | document | page | matched_label | group_bbox | confidence | detection |
|-----|----------|------|---------------|------------|------------|-----------|
| SRC | E01_R1 GA (checksum `3cd70ab1…`) | 1 | 87STUB (+ connector X420) | `{x:0.14,y:0.28,w:0.065,h:0.11}` | HIGH | MANUAL_MAP / INTERNAL_VIEW |
| DST | same | 1 | QDC1 | `{x:0.36,y:0.42,w:0.055,h:0.09}` | HIGH | MANUAL_MAP / INTERNAL_VIEW |

- `paint_mode`: `header_group` both ends  
- BOM / DEVICE REF table text: **not** selected (no overlay on legend/list)  
- Terminal pin 2 / 4: **not** painted

## Browser evidence

| File | Content |
|------|---------|
| [`wire-021-d1-header-groups-red-blue.png`](./wire-021-d1-header-groups-red-blue.png) | Fit-page view: red SRC · 87STUB + blue DST · QDC1 |
| [`wire-021-d1-header-groups-zoomed.png`](./wire-021-d1-header-groups-zoomed.png) | Zoomed match banner + overlays |

UI banner observed: matched Source/Destination groups on INTERNAL_VIEW / INTERNAL_VIEW. Legend: RED = SOURCE, BLUE = DESTINATION.

## Automated tests

```
node --test backend/test/header-group-highlight.test.cjs
ℹ tests 15  pass 15  fail 0

node --test tests/resolve-live-tb-paint-bbox.test.mjs
ℹ pass (includes never naked terminal_cell + page/bbox contracts)
```

Coverage: red/blue roles, ambiguous → Header group not found, equipment connector preference, Wire 021 fixture classification, stale clear / paint_mode header_group.

## Deploy

- API `dist` + manual maps in container `dwes_oci_restore_api_20260725_082028`
- FE build → nginx `dwes_oci_restore_nginx_20260725_082028`
- Health: UI/API 200

## Limitations

- Physical groups for this acceptance case come from **supervisor manual maps** because auto text/OCR did not yield unique eligible markers for 87STUB/QDC1 on this GA.
- Manual map rectangles are normalized INTERNAL_VIEW placements verified for LIVE paint; they are not nearest-text guesses and do not highlight BOM rows.
