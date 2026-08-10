# Panel 001 — Bounded legend vs rear/internal re-diagnosis

**Date:** 2026-08-04  
**Panel / frame:** project `001`, `frame_1785319116166_0_wcplt`, GA `E01_R1.pdf`  
**Checksum:** `3cd70ab1e8afec81847a00196ff087fef12a58378a53ea0f320bcbcfafdcbfb3`  
**Baseline:** `DWES_LIVE_TB_BASELINE=0`

## Verdict

**This GA cannot auto-map.** Schedule TB headers that appear on the drawing sit only in legend/BOM neighborhoods (`legend_or_table` / `LEGEND_OR_BOM`). No rear/internal physical strip hits were over-rejected. **No classification code fix.**

## Evidence

### Latest analysis run (`aa7e0a58-5522-4ddd-8914-41bcdde28d80`)

| Field | Value |
|-------|--------|
| Status | `SCHEDULE_DRAWING_MISMATCH` |
| high / medium | `0` / `0` |
| Readiness | `SEARCHABLE_VECTOR_PDF`, 2 pages |
| Engine notes | `pdfjs-text-layout` + `ocr_worker_path`, `ocr_dpi=400`, `ocr_pages=2`, `ocr_post_classified_views` |
| `headers_legend_only` | X1A-CT, X1B-CT, X4-DC, X5A-C, X5B-C, X6-A, X7, X9, XSH, XTA-1, XTA-2, XTB-1, XTB-2, XTJ |

Nest notes include `non_physical_only:*:legend_or_table` and OCR unresolved lines with `view=LEGEND_OR_BOM|Rejected view LEGEND_OR_BOM` (including X1A-CT with strip-pattern signals still correctly rejected).

### Bounded neighborhood probe (PyMuPDF word boxes)

- Page-level `classify_page_view` can read sheet labels as `INTERNAL_VIEW` (p1) / `REAR_WIRING_VIEW` (p2). That does **not** mean schedule headers are on physical banks.
- Expected headers on p2 sit in the device/TB type table: `X7 … TB-KNIFE TYPE`, `X1A-CT … TB-DISCONNECTING TYPE`, `X4-DC … TB-DISCONNECTING TYPE` → `classify_neighborhood` → **`legend_or_table`** → `classify_header_view` → **`LEGEND_OR_BOM`** (kind overrides page view — correct).
- Kind counts: `legend_or_table=10`, `unknown=2`, **`physical_hits=[]`**.
- `code_fix_needed=false`.

### Standalone OCR page-view pass

Both pages classified `LEGEND_OR_BOM` at worker level; `rear_internal_hit_count=0`.

## Decision

| Question | Answer |
|----------|--------|
| Misclassified rear/internal strips? | **No** |
| Narrow fix in `cli_analyse.py` / `live-tb-view-classification.ts`? | **No** |
| Force HIGH / loosen legend rejection? | **Forbidden — not done** |
| Auto physical mapping for this panel | **N/A (honest FAIL)** |

Proceed to corpus qualification for a GA that actually contains Internal/Rear physical TB banks.
