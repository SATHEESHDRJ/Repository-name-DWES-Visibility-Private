# LIVE TB reproduction (2026-09-21)

Evidence dir: this folder.

## Environment

- Restore API `:3101` healthy (degraded Redis)
- OCR in API container: `python3` + `tesseract` + `pytesseract 5.3.0` (**present**)
- `DWES_LIVE_TB_BASELINE` not required for these probes

## Wire 021/D1 (project 001 / E01_R1)

| Layer | Result |
|-------|--------|
| Auth | tech3 login OK |
| Assignment | id=66 in_progress, frame `frame_1785319116166_0_wcplt`, 365 cables |
| Match API | `source_unmatched=false`, `destination_unmatched=false` |
| detection_method | **MANUAL_MAP** (both ends) |
| Automatic HIGH persist | **Not proven** by this probe |

Artifact: `wire-021-d1-match-fresh.json`

## Wire 20.16:E (project 003)

| Layer | Result |
|-------|--------|
| tech3 Match | **403** Not assigned to panel |
| supervisor1 login | Throttled (429) during session — retry later |
| Historical path | Manual maps + browser PNG; panel OCR `TECHNICAL_FAILURE` |

## Pipeline honesty

```
schedule → wire_id → normalize → pdfjs/OCR → view class → detect → confidence → store → Match → overlay
```

Current restore Match for 021 paints via **manual endpoint mappings**, not fresh automatic OCR HIGH groups. Do **not** claim overall Drawing PASS from Match alone.

## Oversized scanned pixmap

Prior status: NOT TESTED. Code added this session:

- `backend/src/drawing-tb-analysis/oversized-page.util.ts`
- `drawing-process-job.ts` (QUEUED/PROCESSING/READY/PARTIAL/FAILED)
- FE `clampPdfCanvas` in `PdfDocumentViewer`
- OCR CLI downscale in `cli_analyse.py` (original PDF unchanged)
- Dockerfile.api installs tesseract + drawing-intelligence requirements for rebuilds

Acceptance on **original** oversized asset still required after rebuild/deploy of restore API image (Owner approval for image rebuild).
