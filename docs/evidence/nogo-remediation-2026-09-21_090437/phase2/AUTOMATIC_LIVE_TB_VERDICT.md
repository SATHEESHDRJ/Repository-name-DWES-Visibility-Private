# Phase 2 — Automatic LIVE TB (NO-GO evidence)

Timestamp: 2026-09-21

## Constraint reminder
MANUAL_MAP proves overlay consumption only. AUTO/HIGH requires genuine physical detection.

## Actions taken
1. Quarantined disposable MANUAL_MAP files for projects `001` and `003` under `/app/uploads/_manual_map_quarantine_20260921/` (originals preserved; later restored for UI gallery).
2. Match without MANUAL_MAP for Wire **20.16:E** (`H74`/`X10:4` → `KF87L`/`5`): **unmatched** (`match-2016e-no-manual.json`).
3. Ran real Python CLI pipeline on **original oversized SIET-4 Solar Wadi GA** (`drw_b2c17e4b-…_SIET-4 SOLAR WADI PV FEEDER-1_GA.pdf`):
   - page_types: FLATTENED_PDF + SCANNED_PDF ×6 (7 pages)
   - ocr_dpi=200, tiles_generated=42
   - candidates: **0**
   - headers_found: **[]**
   - headers_missing: H74, KF87L, X10
   - notes include `schedule_drawing_mismatch_no_physical_tb_headers_in_drawing`
   - LocateAnything: `GROUNDING_UNAVAILABLE` (no local GPU / future_cloud)
4. Ran CLI on E01_R1 searchable PDF: same outcome — **0 candidates**, SCHEDULE_DRAWING_MISMATCH.
5. Fixed CLI stdout pollution (`warning: fitz…`) and Nest `extractJsonPayload` (brace-balanced first JSON object) so OCR warnings cannot corrupt parse.

## Acceptance matrix

| Case | Result | Method claim |
|------|--------|--------------|
| Wire 021/D1 | PARTIAL / unmatched without MANUAL_MAP | **not AUTO** |
| Wire 20.16:E | SCHEDULE_DRAWING_MISMATCH | **not AUTO** |
| Searchable drawing | SCHEDULE_DRAWING_MISMATCH (E01_R1 CLI) | **not AUTO** |
| Non-searchable scanned | SCHEDULE_DRAWING_MISMATCH (SIET-4) | **not AUTO** |
| Hybrid | not forced HIGH; pipeline available | **not AUTO** |
| Original oversized page | SIET-4 7-page OCR+tile run completed | **not AUTO** |
| FINISHED → next-wire | blocked until AUTO geometry exists | **not proven** |

## Verdict
**AUTOMATIC LIVE TB: FAIL / SCHEDULE_DRAWING_MISMATCH**

Do **not** call any endpoint AUTO/HIGH. Physical TB headers were not detected by OCR; LocateAnything grounding unavailable on this host. Prior MANUAL_MAP overlays remain the only successful overlay path and must not be re-labelled automatic.
