# Wire 20.16:E LIVE ENDPOINT — mapping status

**Date:** 2026-09-19  
**Panel:** Solar Wadi PV FEEDER-1 / project `003`  
**Frame:** `frame_1789793600080_0_hhkw7`  
**GA:** non-searchable scanned PDF (7 pages; text layer empty)  
**Overall drawing mapping (this wire):** PASS with browser evidence  
**Panel TB-analysis pipeline:** FAILED — `TECHNICAL_FAILURE: stage=ocr; retries=2; local_pdf_text_fallback|pdfjs_text_layout|no_pdf_text_glyphs` (manual maps used; OCR not repeated for match)

## Schedule endpoints

| Role | Device | Terminal | Classification |
|------|--------|----------|----------------|
| Source | H74 | X10:4 | EQUIPMENT_CONNECTOR |
| Destination | KF87L | 5 | EQUIPMENT_TERMINAL |

## Physical drawing classification

| Page | View | Eligible auto-paint? |
|------|------|----------------------|
| 3 | FRONT VIEW | No (FRONT rejected) |
| 4 | EXTERNAL + LEGEND/DEVICE REF | No (directory) |
| 6 | INTERNAL VIEW-1 / REAR section | Yes |

## Source H74 — RESOLVED

- Physical footprint on page 6 INTERNAL (left GA layout), view `REAR_WIRING_VIEW`.
- FRONT page 3 manual peer **rejected** as ineligible region.
- Legend/DEVICE REF text never painted.
- Match API: unique eligible candidate page 6.

## Destination KF87L — RESOLVED

- Physical Finder aux-relay module on page 6 LHS DIN rail (manual DEVICE rect).
- Directory/BOM `KF87L` text on the right **not** boxed.
- Distinct from `F87L` protection relay (no alias).

## Browser acceptance (2026-09-19)

- LIVE ENDPOINT VIEW Wire `20.16:E`: red `SRC · H74` + blue `DST · KF87L` group boxes on page 6.
- Right-side LEGEND / SYSTEM SUMMARY not highlighted.
- Evidence: `wire-2016e-browser-both-boxes.png`, `wire-2016e-match-probe.json`, `wire-2016e-h74-kf87l-red-blue.png`.

## Regression

- Wire 021/D1 (`87STUB` / `QDC1`) Match API still matched (source/destination unmatched = false).

## Remaining for overall goal PASS

- Real Cut → Strip → Lug/Crimp → Ready → Finish event projection + no FINISHED backfill (browser).
- FINISHED SSE auto-advance rematch (browser).
- Multi-PDF matrix (searchable / scanned / hybrid) report rows.
- Analysis chip must surface the real OCR failure reason (not bare FAILED forever without detail).
