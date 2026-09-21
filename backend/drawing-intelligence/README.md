# Drawing Intelligence Worker

Internal Python service for maximum-accuracy LIVE TB evidence:

Excel-anchored expected headers → render/tiles → OCR ensemble → LocateAnything
(text + physical) → OpenCV strip → region classification → evidence package.

NestJS owns fusion HIGH gate, TB_GROUP persistence, and Match API.

## Run CLI (Nest fallback)

```bash
echo '{"drawing_path":"C:/path/file.pdf","expected_headers":["X321"],"enrichment":false}' | python cli_analyse.py
```

## Run HTTP worker

```bash
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8091
```

## Env

| Variable | Purpose |
|----------|---------|
| `DWES_DRAWING_INTELLIGENCE_URL` | Nest → HTTP worker |
| `DWES_PYTHON` | CLI interpreter |
| `DWES_TB_SHAPE=0` | Disable OpenCV (default: on for fusion) |
| `DWES_OCR_PROVIDERS=tesseract,paddle` | OCR ensemble |
| `DWES_LOCATE_MODEL` | default `nvidia/LocateAnything-3B` |
| `DWES_LOCATE_MODE` | default `hybrid` |
| `DWES_LOCATE_ENABLE=1` | Attempt local model load (GPU co-located hosts only) |
| `DWES_GROUNDING_EXECUTION_MODE` | `future_cloud` (default) \| `remote_gpu` \| `local` |
| `DWES_GROUNDING_REMOTE_URL` | Future cloud GPU worker base URL (optional) |
| `DWES_GROUNDING_REMOTE_TOKEN` | Optional bearer for remote worker (never DB/JWT) |
| `LOCATEANYTHING_REQUIRED=1` | Nest blocks HIGH when grounding unavailable |

`/health` reports tesseract, paddleocr, locate_anything, locate_model_loaded, locate_anything_provider (nested), opencv, gpu, cuda.

App `ok: true` does **not** mean grounding is ready — local default is `GROUNDING_UNAVAILABLE` under `future_cloud`.

See [`docs/LIVE-TB-CLOUD-GROUNDING-PREP.md`](../../docs/LIVE-TB-CLOUD-GROUNDING-PREP.md).

The worker **never** modifies the original GA file.
