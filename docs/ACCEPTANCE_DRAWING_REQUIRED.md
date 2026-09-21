# ACCEPTANCE DRAWING REQUIRED — Unseeded LIVE TB AUTO/HIGH

**Status:** BLOCKED — no valid acceptance pair found in the restore corpus.  
**Evidence:** `docs/evidence/final-two-blockers-2026-09-21_112345/livetb/`  
**Rule:** Do **not** change the detector further until a drawing exists where **both** scheduled endpoints are visibly present in an **eligible physical panel view** (INTERNAL / REAR / PHYSICAL_*).  
**Forbidden promotions:** MANUAL_MAP, legend coordinates, seeded coordinates → never AUTO/HIGH.

---

## Required acceptance asset (must be supplied)

| Field | Required value |
|-------|----------------|
| **Panel** | SIET-4 Solar Wadi PV Feeder-1 (project **003** / panel **P1**) — or any panel with equivalent clarity |
| **Wire number / reference** | **20.16:E** (schedule `REFRNCE_A`) |
| **Source reference** | **H74** · connector/term **X10:4** (ferrule form `H74:X10:4/…`) |
| **Destination reference** | **KF87L** · term **5** (ferrule form `…/KF87L:5`) |
| **Required page / view class** | One **INTERNAL VIEW** or **REAR VIEW** (or `PHYSICAL_*`) page where **both** H74 and KF87L appear as **physical device / terminal-block enclosures** on the panel — **not** GA front arrangement text, **not** legend/directory/REF tables |

### Acceptance criteria for AUTO/HIGH

1. Quarantine all MANUAL_MAP markers for the pair.
2. Unseeded Match returns `mappingSource=AUTO` and `confidence=HIGH` for **both** ends.
3. Red/blue physical boxes are visible in Match UI on that eligible page.
4. KF87L legend-only hits remain **SAFE MISMATCH PASS** (`SCHEDULE_DRAWING_MISMATCH`) and must **not** box.

---

## KF87L — SAFE MISMATCH PASS (unchanged)

On the current SIET-4 GA page 6 OCR, **KF87L** appears only in a legend/REF line (`KF67,KF87L,KSD, AUXILIARY RELAY…`). That rejection is correct and must stay a **SAFE MISMATCH PASS**. It is **not** positive AUTO acceptance evidence.

---

## Exhaustive search inventory (this restore)

| Asset | Location | Result |
|-------|----------|--------|
| E01_R1.pdf | `001/drawings/` | Searchable glyphs for schedule tags exist, but they are schematic/equipment **labels**, not eligible HIGH physical TB/device group boxes. Prior matrix: `NO_ELIGIBLE_PHYSICAL_TB_GROUP`. |
| SIET-4 GA.pdf | `003/drawings/` | Scanned (0 PDF text). Dest KF87L **legend-only** → SAFE MISMATCH. Src H74 not eligible AUTO HIGH on INTERNAL page. |
| Hybrid PDFs | `003/drawings/drw_matrix_hybrid_*`, `_matrix/` | **Excluded** — MANUAL_MAP remaps; invalid for unseeded acceptance. |
| H00 busbar backups (7×) | `uploads/backups/DRAWING_REPLACE_33kV_BUSBAR_*` | 37-page scanned packages. Spot OCR finds **INTERNAL VIEW / REAR VIEW** mechanical sheets (e.g. p10–11) with device labels (QDC1, 74*), but restore has **no ACTIVE schedule/frame for panel =H00+R** (only E01 / T601 / SIET schedules). Cannot form a scheduled source+dest pair for unseeded Match. Not an acceptance asset for the SIET AUTO/HIGH gate. |
| Project **002** frames | `002/frames/` (T601+R1 schedule) | **No `drawings/` folder** — schedule without drawing → cannot accept. |
| Schedules 001 / 002 / 003 | `*/frames/*.xlsx` | Wires enumerated (IEC ferrule A/B). Known target **20.16:E** = `KF87L:5/H74:X10:4` on 003. Known E01 targets (e.g. QDC1↔74R) lack eligible physical HIGH geometry on E01_R1. |

### Verdict

**No drawing/wire in this restore corpus yields genuine unseeded LIVE TB AUTO/HIGH.**  
Supply the required INTERNAL/REAR page (table above) before any further detector work or AUTO acceptance claims.

---

## Owner UI note (parallel gate — not closed by this file)

Re-review gallery: `docs/evidence/final-two-blockers-2026-09-21_112345/ui/OWNER_REVIEW_GALLERY.html` (**26** PNGs, incl. status-chips). Prior partial export (`OWNER_DECISION_EXPORT_PARTIAL.json`: 8/12/6) is superseded — overall still **PENDING Satheesh explicit acceptance** (`scripts/open-owner-rereview-gallery.ps1`).
