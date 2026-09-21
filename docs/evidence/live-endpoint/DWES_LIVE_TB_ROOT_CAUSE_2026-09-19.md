# LIVE TB — Root-cause investigation (2026-09-19)

## Objective
Trace PDF → LIVE TB overlay before any visual workaround. Record exact failure layer for searchable / hybrid / IMAGE_ONLY drawings.

## Pipeline (authoritative)

```
upload.service (sha256)
→ drawing-tb-analysis.service enqueue/processInline
→ pdf-text-layer (Nest pdfjs) + drawing-intelligence.client (OCR CLI/HTTP)
→ live-tb-view-classification (eligible: REAR/INTERNAL/PHYSICAL_TB_BANK)
→ opencv_strip.detect_strip_around_header
→ excel-ga-cross-verify + evidence-fusion (HIGH gate)
→ automatic-tb-marker.persistHighCandidates (TB_GROUP + checksum)
→ GET api/tb-markers/match
→ LiveTbViewModal / tbGroupHighlightPaint (SRC #dc2626 / DST #2563eb)
```

## Terminology map

| Spec term | Code |
|-----------|------|
| SEARCHABLE | `SEARCHABLE_PDF` → readiness `SEARCHABLE_VECTOR_PDF` |
| HYBRID | readiness `MIXED` |
| IMAGE_ONLY | `SCANNED_PDF` / `IMAGE` / `FLATTENED_PDF` / `VECTOR_PDF_WITHOUT_TEXT` |

**“Legged” / Ferrule-Lug:** engineering metadata only — not a LIVE TB stage.

## Root cause (exact layer)

| Layer | Searchable E01_R1 (panel 001) | IMAGE_ONLY busbar scan |
|-------|-------------------------------|-------------------------|
| PDF text | Glyphs present | Empty / no usable coords |
| View class | Legend/BOM only | Never reached without OCR |
| Physical TB | `headers_found` empty for physical | Blocked — OpenCV needs OCR header box |
| Match/overlay | Correctly refuses paint | N/A |
| **Status bug (fixed)** | Honest `SCHEDULE_DRAWING_MISMATCH` when extraction completed | Was falsely labeled mismatch when OCR worker missing |

**Failure layer for non-searchable:** OCR worker unavailable in restore API container (`python3` / `pytesseract` / `tesseract` absent) → visual package returns null → empty finds. Previously mis-classified as `SCHEDULE_DRAWING_MISMATCH`.

## Fixes applied this session

1. `drawing-tb-analysis.service.ts` — prefer `TECHNICAL_FAILURE` (stage=`ocr`) over `SCHEDULE_DRAWING_MISMATCH` when OCR failed/unavailable and finds are empty.
2. `drawing-intelligence.client.ts` — stamp `ocr_worker_unavailable` + `ocr_stage_failed` when visual package required but null; honour `analyse_once_cache_key` in-process so wire changes do not re-OCR.

## Wire 030 / D3 negative control

- SRC `X321:17` absent on GA; DST `X9` legend/BOM only; physical `headers_found` empty.
- **Expected:** `SCHEDULE_DRAWING_MISMATCH` — **must not** become PASS via baseline or invented paint.
- Fixture `backend/test/fixtures/live-tb-baseline/panel-001-wire-030.json` proves overlay **consume** path only (`DWES_LIVE_TB_BASELINE=1`); not automatic detection proof.

## Environment evidence (2026-09-19)

| Check | Result |
|-------|--------|
| API health | ok / degraded (no Redis) |
| Container OCR | `python3` not found; no tesseract |
| Host pytesseract | ModuleNotFoundError |
| Active GA | `001/.../E01_R1.pdf` (searchable, legend-only TBs) |
| Scanned GA | Backup `33kV BUSBAR...(_H00+R).pdf` — unbound, not acceptance corpus |
| `DWES_LIVE_TB_BASELINE` | unset / 0 |

## Gate status (this restore)

| Gate | Status |
|------|--------|
| Searchable PDF detection | PASS (pdfjs path) |
| Non-searchable PDF OCR detection | **BLOCKED** — OCR worker not installed in API image |
| Physical TB-bank detection | **BLOCKED** for IMAGE_ONLY (depends on OCR); searchable legend corpus correctly rejects |
| Excel/schedule-to-GA verification | PASS (mismatch / reject legend) |
| Browser LIVE TB overlay | PARTIAL — safe states + red/blue paint path exist; no AUTO HIGH on this corpus |
| Wire 030/D3 negative | PASS as negative control (must stay mismatch) |

## Overall LIVE TB

**BLOCKED (corpus + OCR worker)** — do not report overall PASS until a real non-searchable GA completes OCR → physical TB → match → browser overlay with `DWES_LIVE_TB_BASELINE=0`.
