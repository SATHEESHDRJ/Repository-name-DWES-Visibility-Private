# LIVE TB — Cloud-ready grounding preparation (local CPU-only)

Date: 2026-08-08  
Repository: `02_GIT_PRODUCTION_SOURCE/DWES`  
Scope: **architecture prep only** — no cloud GPU, queue, or object-storage deploy.

---

## Honest status

| Area | Status |
|------|--------|
| LOCAL APPLICATION | PASS |
| OCR/OpenCV PIPELINE | PASS |
| EVIDENCE FUSION | PASS |
| LOCATEANYTHING ARCHITECTURE | IMPLEMENTED (provider contract) |
| LOCAL LOCATEANYTHING INFERENCE | BLOCKED — NO NVIDIA GPU |
| FULL AUTO_VERIFIED PHYSICAL LIVE TB | PENDING CLOUD GPU + VALID POSITIVE GA |

**Status line:** Maximum-accuracy LIVE TB pipeline implemented; real physical-strip end-to-end acceptance pending cloud GPU grounding runtime and a valid positive GA.

Panel `001` / `=E01_R1` remains a **negative legend-only fixture** — not a positive acceptance corpus.

---

## Locked decisions

- Laptop has **no NVIDIA GPU** — do not force LocateAnything onto this machine for acceptance.
- Keep `LOCATEANYTHING_REQUIRED=1` / HIGH fusion gate **unchanged**.
- Local app runs with `GROUNDING_UNAVAILABLE` as the expected LocateAnything state.
- Nest remains source of truth; GPU worker **never** writes DWES DB.
- Technician LIVE TB never calls grounding (cached `TB_GROUP` / Match only).
- No commit / push / production deploy in this task.

---

## Execution mode

Env: `DWES_GROUNDING_EXECUTION_MODE`

| Value | Provider | Laptop default |
|-------|----------|----------------|
| `future_cloud` | `UnavailableGroundingProvider` | **Yes** |
| `remote_gpu` | `RemoteLocateAnythingProvider` (URL required) | No |
| `local` | `LocalLocateAnythingProvider` (GPU host + `DWES_LOCATE_ENABLE=1`) | No |

Related env (future remote only; do not deploy now):

- `DWES_GROUNDING_REMOTE_URL` — base URL for `GET /health` + `POST /locate`
- `DWES_GROUNDING_REMOTE_TOKEN` — optional bearer for the worker (never Nest JWT / DB URL)

---

## Provider contract

Module: [`backend/drawing-intelligence/visual_grounding_provider.py`](../backend/drawing-intelligence/visual_grounding_provider.py)

Methods:

- `health()`
- `locate_text(...)`
- `locate_physical_tb_group(...)`
- `analyse_tile(...)`
- `ground_header(...)` — convenience combining text + physical

Factory: `get_visual_grounding_provider()`.

Local implementation remains in [`locate_anything.py`](../backend/drawing-intelligence/locate_anything.py) as `LocalLocateAnythingProvider` (alias `LocateAnythingGroundingProvider`).

Nest fusion ([`evidence-fusion.ts`](../backend/src/drawing-tb-analysis/evidence-fusion.ts)) stays location-agnostic — consumes evidence / `grounding_unavailable` only. **No HIGH gate edits.**

---

## Health model (app healthy ≠ grounding ready)

Local `/health` + Nest readiness include:

```json
"locate_anything_provider": {
  "required": true,
  "execution_mode": "future_cloud",
  "available": false,
  "status": "GROUNDING_UNAVAILABLE",
  "model_loaded": false,
  "inference_ready": false
}
```

Flat keys (`locate_anything`, `locate_model_loaded`, `locate_status`) remain for backward compatibility.

Future cloud (when wired — not deployed now):

```json
"locate_anything_provider": {
  "required": true,
  "execution_mode": "remote_gpu",
  "available": true,
  "status": "LOCATE_READY",
  "model_loaded": true,
  "inference_ready": true
}
```

Supervisor/debug may surface grounding unavailable; Technician banners unchanged.

---

## Cache identity

Helper (Python + Nest):

`drawing_checksum | page | tile | expected_header | model_revision | pipeline_version | generation_mode`

- Python: `build_grounding_cache_key(...)`
- Nest: `buildGroundingCacheKey(...)`

No Redis / cloud cache required in this task.

---

## Drawing identity / storage boundary

Domain key:

`project_code + frame_id + slot + revision + checksum`

- Nest: `buildDrawingIdentity(...)`
- Python: `build_drawing_identity(...)`

Analysis-domain logic must not hardcode Windows paths. Path resolution stays in FrameStore / configured upload roots. A later local-FS → object-storage swap must keep the same domain keys.

---

## Job stage boundaries

Compatible with a future queue; **today** analysis still runs as the existing `drawing_tb_analysis` job (no new cloud queue).

| Stage | Responsibility |
|-------|----------------|
| `GA_ANALYSIS` | Page render, view classification, package identity |
| `OCR_ANALYSIS` | Tesseract / Paddle / constrained normalize / tiles OCR |
| `VISUAL_GROUNDING` | LocateAnything text + physical (provider) |
| `EVIDENCE_FUSION` | Nest multi-evidence HIGH gate (CPU) |

Constants: Python `JOB_STAGES` / Nest `LIVE_TB_JOB_STAGES`.

---

## Future GPU worker contract (do not deploy)

Worker:

- Loads LocateAnything; supports text / physical / hybrid / slow.
- Receives tile metadata + expected header + minimal drawing identity (checksum/page/tile).
- Returns boxes / evidence only.
- **Must not** receive: DB URLs, Nest JWTs, Director/Technician session data, Windows paths as secrets.

Stub schema — `POST {DWES_GROUNDING_REMOTE_URL}/locate`:

```json
{
  "header": "X9",
  "prompt_kind": "text|physical|tile",
  "generation_mode": "hybrid",
  "tiles": [{ "tile_id": "...", "page": 1, "x": 0, "y": 0, "width": 0, "height": 0 }],
  "tile": null,
  "model": "nvidia/LocateAnything-3B",
  "pipeline_version": "max-accuracy-evidence-fusion-v1"
}
```

Response (evidence only):

```json
{
  "locate_status": "LOCATE_COMPLETE",
  "text_hits": [],
  "physical_hits": [],
  "model_revision": "...",
  "inference_time_ms": 0,
  "device": "cuda",
  "notes": []
}
```

`RemoteLocateAnythingProvider` implements the client stub; if URL unset → same as unavailable.

---

## Explicit non-goals (this task)

- Buy/configure GPU on laptop
- Force CPU LocateAnything inference for acceptance
- Weaken evidence fusion / bypass mandatory grounding
- Fake AUTO_VERIFIED / fake coordinates
- Deploy cloud GPU, queue, or object storage
- Commit / push / production deploy
- Change Technician business workflows
