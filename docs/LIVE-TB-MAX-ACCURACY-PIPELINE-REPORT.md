# LIVE TB — Maximum Accuracy Evidence-Fusion Pipeline Report

Date: 2026-08-08  
Repository: `02_GIT_PRODUCTION_SOURCE/DWES`  
Pipeline version: `max-accuracy-evidence-fusion-v1`  
Scope: local development / verification only — **no commit, push, PR, or production deploy**.

**Status line:** Maximum-accuracy LIVE TB pipeline implemented; real physical-strip end-to-end acceptance pending cloud GPU grounding runtime and a valid positive GA.

---

## Acceptance status matrix

| Area | Status |
|------|--------|
| LOCAL APPLICATION | PASS |
| OCR/OpenCV PIPELINE | PASS |
| EVIDENCE FUSION | PASS |
| LOCATEANYTHING ARCHITECTURE | IMPLEMENTED (provider contract) |
| LOCAL LOCATEANYTHING INFERENCE | BLOCKED — NO NVIDIA GPU |
| FULL AUTO_VERIFIED PHYSICAL LIVE TB | PENDING CLOUD GPU + VALID POSITIVE GA |

Cloud-ready prep (no deploy): [`LIVE-TB-CLOUD-GROUNDING-PREP.md`](LIVE-TB-CLOUD-GROUNDING-PREP.md).  
Default local grounding mode: `DWES_GROUNDING_EXECUTION_MODE=future_cloud` → `GROUNDING_UNAVAILABLE` (expected).

---

## A. LocateAnything installation / runtime

| Item | Status |
|------|--------|
| Provider contract | [`visual_grounding_provider.py`](../backend/drawing-intelligence/visual_grounding_provider.py) |
| Local provider module | [`locate_anything.py`](../backend/drawing-intelligence/locate_anything.py) |
| Model id | `nvidia/LocateAnything-3B` (`DWES_LOCATE_MODEL`) |
| Default mode | `hybrid` (`DWES_LOCATE_MODE`) |
| Execution mode | `future_cloud` default (`DWES_GROUNDING_EXECUTION_MODE`) |
| Enable flag (local only) | `DWES_LOCATE_ENABLE=1` required to attempt weight load |
| This host | `nvidia-smi` unavailable → `GROUNDING_UNAVAILABLE` |
| Health | Live probe via `health_probe.build_health()` — app `ok` independent of grounding |
| License | [`docs/LIVE-TB-LOCATEANYTHING-LICENSE.md`](LIVE-TB-LOCATEANYTHING-LICENSE.md) |

Architecture allows swapping to a licensed production / cloud GPU grounder behind the same provider interface without rewriting LIVE TB Nest/match/overlay.

---

## B. GPU / CPU / RAM

| Resource | Observed |
|----------|----------|
| CUDA | `false` on this workstation |
| GPU name | `unavailable` |
| LocateAnything | Cannot load for acceptance until GPU worker + `DWES_LOCATE_ENABLE=1` |
| OCR / OpenCV | CPU path supported |

---

## C. Tesseract results

- Provider: `TesseractOcrProvider` in `ocr_providers.py`
- Orientations 0/90/180/270 + OSD retained in `cli_analyse.py`
- Constrained normalization vs `EXPECTED_TB_HEADERS` (no global autocorrect)
- Host health probe: `tesseract: false` in bare CLI env used for this report (container may differ)

---

## D. PaddleOCR results

- Abstraction: `PaddleOcrProvider` (soft-fail)
- Enabled when `DWES_OCR_PROVIDERS` contains `paddle`
- Health: `paddleocr: false` until package installed
- Fusion does not invent Paddle matches when unavailable

---

## E / F. LocateAnything text / physical grounding

- Multi-prompt templates A–D defined (text + physical)
- Runs for every expected header when analysis package attaches
- Without loaded model / future_cloud mode: `GROUNDING_UNAVAILABLE`, **empty boxes** (never invented)
- With `LOCATEANYTHING_REQUIRED=1`: Nest fusion **blocks AUTO_VERIFIED HIGH**

---

## G. OpenCV geometry

- Module: `opencv_strip.py` — always attempted unless `DWES_TB_SHAPE=0`
- Expands text bbox → physical strip bbox when regular cells detected
- Emits `physical_strip_detected`, orientation, spacing/geometry scores

---

## H. Page / region classification

- Existing page + neighborhood classifiers retained
- Evidence object stores `page` + `region` + `view_name`
- Paintable: Internal / Rear / Physical TB bank only
- Legend/front/BOM/schematic rejected for HIGH paint

---

## I. Evidence-fusion decision

- Nest: [`evidence-fusion.ts`](../backend/src/drawing-tb-analysis/evidence-fusion.ts)
- Client always requests full visual package when drawing exists
- HIGH requires schedule + eligible region + unique + checksum + real box + OpenCV + text evidence + Locate physical when required

---

## J–L. Source / Destination / same-header

- Unchanged match API contract (independent Source/Dest; `same_physical_group`)
- Reusable `TB_GROUP` persistence + checksum binding preserved

---

## M. False-positive rejection

- Fusion result `HEADER_FOUND_ONLY_NON_PHYSICAL_REGION` for legend/front-only hits
- Multiple paintable peers → `REVIEW_REQUIRED` (never guess)

---

## N. Checksum safety

- Markers remain bound to `drawing_checksum`
- Analyse-once cache key: checksum | locate revision | ocr versions | render | pipeline_version

---

## O–P. Match API / browser overlay

- Technician UX unchanged (Source red / Dest blue; no engine names)
- Supervisor panel shows evidence checklist (OCR / Locate text / Locate physical / OpenCV / View)

---

## Q. Accuracy benchmark

| Detector | Status on this host |
|----------|---------------------|
| Tesseract only | Infrastructure ready; corpus still legend-limited |
| PaddleOCR only | Not installed (`paddleocr: false`) |
| LocateAnything only | Unavailable (`future_cloud` / no GPU) |
| OpenCV only | Module ready |
| Combined ensemble | Wired; HIGH gated by Locate when `LOCATEANYTHING_REQUIRED=1` |

**Acceptance:** **BLOCKED** for end-to-end AUTO_VERIFIED paint until:
1. GPU LocateAnything worker reports `locate_model_loaded=true`, and
2. Qualifying Internal/Rear GA replaces legend-only panel 001 corpus.

---

## R. Unresolved cases

- Panel 001 / E01_R1 legend-only GA → schedule–drawing mismatch (prior acceptance record still valid)
- LocateAnything weights / forward API not loaded on this host

---

## S. Files changed (primary)

**Python worker**
- `drawing-intelligence/app.py`, `cli_analyse.py`, `requirements.txt`
- `health_probe.py`, `tiling.py`, `ocr_providers.py`, `locate_anything.py`, `opencv_strip.py`, `evidence_pipeline.py`
- `visual_grounding_provider.py` (cloud-ready provider contract)
- `test_max_accuracy_pipeline.py`

**Nest**
- `live-tb-contracts.ts`, `drawing-readiness.ts`, `drawing-intelligence.client.ts`
- `evidence-fusion.ts` (+ cache/identity/job-stage helpers), `expected-headers.ts`, `drawing-tb-analysis.service.ts`
- `test/evidence-fusion.test.cjs`

**FE**
- `LiveTbSupervisorPanel.tsx` (evidence checklist)

**Docs**
- `LIVE-TB-LOCATEANYTHING-LICENSE.md`
- `LIVE-TB-CLOUD-GROUNDING-PREP.md`
- this report

---

## T. Tests

```
node backend/test/evidence-fusion.test.cjs          → OK
python backend/drawing-intelligence/test_max_accuracy_pipeline.py → OK (5 tests)
```

---

## U. Confirmation

- **No** git commit
- **No** push / merge / tag / PR
- **No** production deploy / OCI modification
- **No** destructive DB migration
- `DWES_LIVE_TB_BASELINE` remains default-off for acceptance
