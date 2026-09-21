# Endpoint-presence matrix — LIVE TB root cause

Evidence: `docs/evidence/blocker-remediation-2026-09-21_105356/livetb/`  
Manual maps quarantined under `/app/uploads/_blocker_quarantine/` during probes (not used as AUTO).

## Wire 20.16:E — project 003 / SIET-4 Solar Wadi GA

| Field | Source (H74 / X10:4) | Destination (KF87L / 5) |
|-------|----------------------|-------------------------|
| Scheduled refs | H74 · connector X10 · term 4 | KF87L · term 5 |
| Drawing | Original oversized SIET-4 GA (7 pages, scanned, 0 PDF text chars) | same |
| Page (human MANUAL_MAP notes) | INTERNAL VIEW-1 page 6 REAR (claimed) | INTERNAL VIEW-1 page 6 DIN rail (claimed) |
| Page (automatic OCR @350 enrich) | H74 hit page **3** FRONT arrangement text `H74-600` — tiny glyph, AMBIGUOUS | **no** physical KF87L candidate |
| OCR/raw (page 6 @300dpi) | **H74 MISS** | **KF87L FOUND only in LEGEND line** `KF67,KF87L,KSD, AUXILIARY RELAY…` |
| Terminal/device candidates | H74 AMBIGUOUS OCR (page 3); X10 MEDIUM OCR_AND_SHAPE (page 6) | none physical |
| Coordinates | H74 ≈ `{x:0.21,y:0.14,w:0.008,h:0.005}` page 3 | n/a |
| Confidence | AMBIGUOUS / not HIGH | n/a |
| Legend/directory excluded | Page 3 hit is GA FRONT DETAILS / arrangement — not eligible INTERNAL/REAR bank | Legend REF table — **must not box** |
| Match unseeded | unmatched / Header group not found for H74 | unmatched / Header group not found for KF87L |
| Final reason code | `DETECTOR_WEAK_OR_WRONG_VIEW` + no HIGH persist | **`SCHEDULE_DRAWING_MISMATCH` (legend-only)** — safe rejection PASS; positive AUTO acceptance NOT TESTED |

Artifacts: `match-2016e-unseeded.json`, `siet-p6-analyse.json`, page-6 OCR log in this folder.

## Wire 021/D1 — project 001 / E01_R1

| Field | Source (87STUB / X420:2) | Destination (QDC1 / 4) |
|-------|--------------------------|------------------------|
| Scheduled refs | 87STUB · X420:2 (REFRNCE 021/D1) | QDC1 · 4 |
| Drawing | E01_R1.pdf searchable (glyphs present) | same |
| PDF text presence | **87STUB FOUND** (many page-1 glyph hits) | **QDC1 FOUND** (page 2) |
| Glyph coords (examples) | page1 ≈ x=0.61–0.80, y=0.23–0.40, **tiny labels** (~2%×1%) | page2 ≈ x=0.65,y=0.21,w=0.014,h=0.01 |
| MANUAL_MAP boxes (historical, not AUTO) | x=0.14,y=0.28,w=0.065,h=0.11 — **does not coincide** with glyph cluster | x=0.36,y=0.42,w=0.055,h=0.09 |
| Physical-region class | Glyphs behave as schematic/equipment labels; analysis status `SCHEDULE_DRAWING_MISMATCH` | same |
| Stored ACTIVE auto HIGH for these tags | **none** (DEBUG seeds + SUPERSEDED unrelated headers only) | none |
| Match unseeded | unmatched / no marker for 87STUB | unmatched / no marker for QDC1 |
| Final reason code | **`NO_ELIGIBLE_PHYSICAL_TB_GROUP`** — searchable labels ≠ HIGH physical device/TB enclosure; expanding glyphs to invent large boxes forbidden | same |

Artifacts: `match-021-d1-unseeded.json`, `e01-pdf-bboxes.json`, `pdf-text-presence.json`, `analysis-status-001.json`.

## Classification summary

| Case | Safe rejection? | Detector bug? | AUTO/HIGH allowed? |
|------|-----------------|---------------|--------------------|
| 20.16:E dest KF87L | **Yes** — legend-only OCR | N/A for HIGH | No |
| 20.16:E src H74 on p6 | OCR miss on INTERNAL page; p3 hit ineligible FRONT | Partial (view class + OCR miss) | No until eligible HIGH |
| 021/D1 both ends | Labels exist; not eligible physical group boxes | Nest path does not persist HIGH DEVICE/TB for these tags | No without eligible geometry |
| Positive AUTO acceptance | — | — | **NOT TESTED / BLOCKED** |

## Acceptance drawing search

Hybrid PDFs under `003/drawings/` are composites remapping MANUAL_MAP pages — **not** valid unseeded acceptance assets.  
No drawing/wire in this restore corpus produced unseeded `mappingSource=AUTO` + `confidence=HIGH` with red/blue physical boxes after map quarantine.

### Verdict
**BLOCKED — VALID ACCEPTANCE DRAWING REQUIRED**

Do not promote MANUAL_MAP to AUTO/HIGH. Do not seed coordinates.
