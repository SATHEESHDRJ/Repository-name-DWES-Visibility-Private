# LIVE TB — LocateAnything license record

## Model

| Field | Value |
|-------|--------|
| Model id | `nvidia/LocateAnything-3B` |
| Role | Mandatory text + physical TB-group grounding (not OCR fallback) |
| Default generation mode | `hybrid` (second pass `slow` when unresolved/ambiguous) |
| Env | `DWES_LOCATE_MODEL`, `DWES_LOCATE_MODE`, `LOCATEANYTHING_REQUIRED` |

## License note

Currently released NVIDIA LocateAnything-3B weights are distributed under
**non-commercial / research** terms. DWES uses them for **local accuracy
acceptance and engineering evaluation only**.

- Do **not** remove LocateAnything from the local accuracy pipeline solely
  because of this license.
- Production release requires separate licensing approval **or** a drop-in
  replacement grounder behind the same `GroundingProvider` interface
  (`locate_text` / `locate_physical_group` stages).
- LIVE TB Nest contracts, evidence fusion, and technician overlay must not
  hard-code NVIDIA-only APIs beyond the provider adapter.

## Architecture swap path

```
GroundingProvider
  ├── LocateAnythingGroundingProvider   (local / research weights)
  └── FutureLicensedGroundingProvider   (production-approved model)
```

Persisted evidence stores: `locate_model`, `locate_model_revision`,
`generation_mode`, `inference_time_ms`, `device`, `tile_id`, `prompt_type`.

## Acceptance gate

When `LOCATEANYTHING_REQUIRED=1`:

- Worker must report `locate_model_loaded=true` via a **live** health probe
  (not file existence alone).
- Analysis must not create `AUTO_VERIFIED HIGH` under `GROUNDING_UNAVAILABLE`
  / `LOCATE_UNAVAILABLE`.
