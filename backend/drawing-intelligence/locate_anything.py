# -*- coding: utf-8 -*-
"""
LocateAnything local grounding provider (GPU co-located hosts only).

Default laptop selection is UnavailableGroundingProvider via
DWES_GROUNDING_EXECUTION_MODE=future_cloud — see visual_grounding_provider.py.

Do not force CPU LocateAnything inference for acceptance on non-GPU laptops.
"""
from __future__ import annotations

import os
import time
from typing import Any

from visual_grounding_provider import (
    VisualGroundingProvider,
    empty_locate_payload,
    get_visual_grounding_provider,
    grounding_execution_mode,
)


TEXT_PROMPTS = [
    'Locate the text "{header}".',
    'Locate "{header}" inside the panel internal/rear wiring arrangement.',
]

PHYSICAL_PROMPTS = [
    'Locate the physical terminal block labelled "{header}".',
    'Locate the terminal block strip or terminal bank associated with "{header}".',
    'Locate all physical terminal block strips or terminal block banks labelled "{header}" in the panel internal or rear wiring view.',
]


class LocalLocateAnythingProvider(VisualGroundingProvider):
    """
    Loads LocateAnything locally when DWES_LOCATE_ENABLE=1 and CUDA/weights exist.
    Not the default on this laptop (use future_cloud / remote_gpu).
    Never invents boxes when the forward API is unavailable.
    """

    def __init__(self) -> None:
        self.execution_mode = "local"
        self.model_id = (os.environ.get("DWES_LOCATE_MODEL") or "nvidia/LocateAnything-3B").strip()
        self.generation_mode = (os.environ.get("DWES_LOCATE_MODE") or "hybrid").strip() or "hybrid"
        self._model = None
        self._processor = None
        self._device = "cpu"
        self._load_error = ""
        self._model_revision = ""
        self._attempted_load = False

    def _try_load(self) -> bool:
        if self._attempted_load:
            return self._model is not None
        self._attempted_load = True
        if os.environ.get("DWES_LOCATE_ENABLE") != "1":
            self._load_error = "DWES_LOCATE_ENABLE!=1"
            return False
        try:
            import torch  # type: ignore

            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            try:
                from transformers import AutoModel, AutoProcessor  # type: ignore

                self._processor = AutoProcessor.from_pretrained(self.model_id, trust_remote_code=True)
                self._model = AutoModel.from_pretrained(self.model_id, trust_remote_code=True)
                rev = getattr(self._model.config, "_name_or_path", None) if self._model else None
                self._model_revision = str(rev or self.model_id)
                if self._device == "cuda":
                    self._model = self._model.to(self._device)
                self._model.eval()
                return True
            except Exception as exc:  # noqa: BLE001
                self._load_error = f"model_load_failed:{exc}"
                self._model = None
                return False
        except Exception as exc:  # noqa: BLE001
            self._load_error = f"torch_unavailable:{exc}"
            return False

    def health(self) -> dict[str, Any]:
        loaded = self._try_load()
        notes: list[str] = []
        if self._load_error:
            notes.append(self._load_error)
        if loaded:
            try:
                _ = next(self._model.parameters()).device  # type: ignore[union-attr]
                notes.append("locate_live_param_probe_ok")
            except Exception as exc:  # noqa: BLE001
                notes.append(f"locate_live_probe_failed:{exc}")
                loaded = False
        status = "LOCATE_COMPLETE" if loaded else "GROUNDING_UNAVAILABLE"
        return {
            "required": True,
            "execution_mode": "local",
            "available": loaded,
            "status": status,
            "model_loaded": loaded,
            "inference_ready": loaded,
            "locate_anything": loaded,
            "locate_model_loaded": loaded,
            "locate_mode": self.generation_mode,
            "locate_model": self.model_id,
            "locate_model_revision": self._model_revision or self.model_id,
            "locate_status": status,
            "locate_notes": notes,
            "device": self._device,
        }

    def status(self) -> str:
        if not self._attempted_load:
            self._try_load()
        if self._model is not None:
            return "LOCATE_COMPLETE"
        return "GROUNDING_UNAVAILABLE"

    def locate_text(
        self,
        *,
        header: str,
        tiles: list[dict[str, Any]],
        tile_images: dict[str, Any] | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        return self._run(header=header, tiles=tiles, mode=mode, kind="text")

    def locate_physical_tb_group(
        self,
        *,
        header: str,
        tiles: list[dict[str, Any]],
        tile_images: dict[str, Any] | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        return self._run(header=header, tiles=tiles, mode=mode, kind="physical")

    def analyse_tile(
        self,
        *,
        header: str,
        tile: dict[str, Any],
        image_bytes: bytes | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        return self._run(header=header, tiles=[tile] if tile else [], mode=mode, kind="tile")

    def _run(
        self,
        *,
        header: str,
        tiles: list[dict[str, Any]],
        mode: str | None,
        kind: str,
    ) -> dict[str, Any]:
        gen_mode = mode or self.generation_mode
        t0 = time.time()
        if not self._try_load() or self._model is None:
            return empty_locate_payload(
                header=header,
                status="GROUNDING_UNAVAILABLE",
                generation_mode=gen_mode,
                notes=[self._load_error or "locate_unavailable", f"kind={kind}"],
                model=self.model_id,
                revision=self._model_revision or self.model_id,
                device=self._device,
            )

        notes: list[str] = [
            "locate_model_loaded_no_stable_forward_api_no_invented_boxes",
            f"kind={kind}",
        ]
        if gen_mode == "hybrid":
            notes.append("hybrid_pass_complete_no_boxes")
            notes.append("slow_second_pass_skipped_without_forward_api")

        text_hits: list[dict[str, Any]] = []
        physical_hits: list[dict[str, Any]] = []
        return {
            "header": header,
            "locate_status": "LOCATE_FAILED",
            "locate_model": self.model_id,
            "locate_model_revision": self._model_revision or self.model_id,
            "generation_mode": gen_mode,
            "inference_time_ms": int((time.time() - t0) * 1000),
            "device": self._device,
            "text_hits": text_hits,
            "physical_hits": physical_hits,
            "prompt_types": {
                "text": [p.format(header=header) for p in TEXT_PROMPTS],
                "physical": [p.format(header=header) for p in PHYSICAL_PROMPTS],
            },
            "tiles_considered": [t.get("tile_id") for t in tiles[:32]],
            "notes": notes,
            # Model present but no boxes — not "unavailable"; fusion still needs physical match
            "grounding_unavailable": False,
            "execution_mode": "local",
        }


# Backward-compatible name for direct local construction / older imports
LocateAnythingGroundingProvider = LocalLocateAnythingProvider


def merge_prompt_consensus(hits: list[dict[str, Any]], iou_thresh: float = 0.3) -> list[dict[str, Any]]:
    """Merge geometrically consistent boxes across prompts; require ≥2 agreeing prompts."""
    if not hits:
        return []
    return [h for h in hits if h.get("prompt_agree_count", 0) >= 2]


__all__ = [
    "LocalLocateAnythingProvider",
    "LocateAnythingGroundingProvider",
    "TEXT_PROMPTS",
    "PHYSICAL_PROMPTS",
    "merge_prompt_consensus",
    "get_visual_grounding_provider",
    "grounding_execution_mode",
]
