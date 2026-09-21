# -*- coding: utf-8 -*-
"""
Visual grounding provider contract for LIVE TB.

Laptop default: execution_mode=future_cloud → UnavailableGroundingProvider
(GROUNDING_UNAVAILABLE, empty boxes). No invented coordinates.

Future cloud GPU worker plugs in via RemoteLocateAnythingProvider without
changing Nest LIVE TB business logic or weakening the HIGH fusion gate.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from typing import Any

PIPELINE_VERSION = "max-accuracy-evidence-fusion-v1"

# Job stage names (compatible with a future queue; local job remains drawing_tb_analysis).
STAGE_GA_ANALYSIS = "GA_ANALYSIS"
STAGE_OCR_ANALYSIS = "OCR_ANALYSIS"
STAGE_VISUAL_GROUNDING = "VISUAL_GROUNDING"
STAGE_EVIDENCE_FUSION = "EVIDENCE_FUSION"

JOB_STAGES = (
    STAGE_GA_ANALYSIS,
    STAGE_OCR_ANALYSIS,
    STAGE_VISUAL_GROUNDING,
    STAGE_EVIDENCE_FUSION,
)

EXECUTION_MODES = ("future_cloud", "remote_gpu", "local")


def grounding_execution_mode() -> str:
    raw = (os.environ.get("DWES_GROUNDING_EXECUTION_MODE") or "future_cloud").strip().lower()
    if raw in EXECUTION_MODES:
        return raw
    return "future_cloud"


def empty_locate_payload(
    *,
    header: str,
    status: str = "GROUNDING_UNAVAILABLE",
    generation_mode: str = "hybrid",
    notes: list[str] | None = None,
    model: str = "",
    revision: str = "",
    device: str = "none",
    grounding_unavailable: bool = True,
) -> dict[str, Any]:
    return {
        "header": header,
        "locate_status": status,
        "locate_model": model,
        "locate_model_revision": revision or model,
        "generation_mode": generation_mode,
        "inference_time_ms": 0,
        "device": device,
        "text_hits": [],
        "physical_hits": [],
        "notes": list(notes or []),
        "grounding_unavailable": grounding_unavailable,
    }


def build_grounding_cache_key(
    *,
    drawing_checksum: str,
    page: int | str,
    tile: str,
    expected_header: str,
    model_revision: str = "",
    pipeline_version: str = PIPELINE_VERSION,
    generation_mode: str = "hybrid",
) -> str:
    """
    Cache identity for future reuse (local helper; no Redis required now).

    drawing_checksum | page | tile | expected_header | model_revision |
    pipeline_version | generation_mode
    """
    return "|".join(
        [
            str(drawing_checksum or ""),
            str(page or ""),
            str(tile or ""),
            str(expected_header or "").upper(),
            str(model_revision or "no-locate"),
            str(pipeline_version or PIPELINE_VERSION),
            str(generation_mode or "hybrid"),
        ]
    )


def build_drawing_identity(
    *,
    project_code: str,
    frame_id: str,
    slot: str = "2d",
    revision: str = "",
    checksum: str = "",
) -> dict[str, str]:
    """
    Domain drawing identity — never a Windows path.
    Storage roots resolve separately via FrameStore / configured upload dirs.
    """
    return {
        "project_code": str(project_code or "").strip(),
        "frame_id": str(frame_id or "").strip(),
        "slot": str(slot or "2d").strip() or "2d",
        "revision": str(revision or "").strip(),
        "checksum": str(checksum or "").strip().lower(),
    }


class VisualGroundingProvider(ABC):
    """Location-agnostic grounding interface consumed by the evidence pipeline."""

    @abstractmethod
    def health(self) -> dict[str, Any]:
        ...

    @abstractmethod
    def locate_text(
        self,
        *,
        header: str,
        tiles: list[dict[str, Any]],
        tile_images: dict[str, Any] | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        ...

    @abstractmethod
    def locate_physical_tb_group(
        self,
        *,
        header: str,
        tiles: list[dict[str, Any]],
        tile_images: dict[str, Any] | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        ...

    @abstractmethod
    def analyse_tile(
        self,
        *,
        header: str,
        tile: dict[str, Any],
        image_bytes: bytes | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        ...

    def ground_header(
        self,
        *,
        header: str,
        tiles: list[dict[str, Any]],
        tile_images: dict[str, Any] | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        """Combine text + physical grounding into one evidence payload."""
        text = self.locate_text(
            header=header, tiles=tiles, tile_images=tile_images, mode=mode,
        )
        phys = self.locate_physical_tb_group(
            header=header, tiles=tiles, tile_images=tile_images, mode=mode,
        )
        notes = list(text.get("notes") or []) + list(phys.get("notes") or [])
        unavailable = bool(text.get("grounding_unavailable")) or bool(
            phys.get("grounding_unavailable")
        )
        status = text.get("locate_status") or phys.get("locate_status") or "GROUNDING_UNAVAILABLE"
        if unavailable:
            status = "GROUNDING_UNAVAILABLE"
        return {
            "header": header,
            "locate_status": status,
            "locate_model": text.get("locate_model") or phys.get("locate_model") or "",
            "locate_model_revision": text.get("locate_model_revision")
            or phys.get("locate_model_revision")
            or "",
            "generation_mode": mode
            or text.get("generation_mode")
            or phys.get("generation_mode")
            or "hybrid",
            "inference_time_ms": int(text.get("inference_time_ms") or 0)
            + int(phys.get("inference_time_ms") or 0),
            "device": text.get("device") or phys.get("device") or "none",
            "text_hits": list(text.get("text_hits") or []),
            "physical_hits": list(phys.get("physical_hits") or []),
            "notes": notes,
            "grounding_unavailable": unavailable,
            "execution_mode": getattr(self, "execution_mode", grounding_execution_mode()),
        }

    # Backward-compatible alias used by older call sites / health probes
    def health_probe(self) -> dict[str, Any]:
        return self.health()


class UnavailableGroundingProvider(VisualGroundingProvider):
    """
    Default local provider when execution_mode=future_cloud.
    Always GROUNDING_UNAVAILABLE — never crashes, never invents boxes.
    """

    def __init__(self, *, execution_mode: str | None = None, reason: str = "") -> None:
        self.execution_mode = execution_mode or grounding_execution_mode()
        self.reason = reason or "future_cloud_no_local_gpu"
        self.generation_mode = (os.environ.get("DWES_LOCATE_MODE") or "hybrid").strip() or "hybrid"
        self.model_id = (os.environ.get("DWES_LOCATE_MODEL") or "nvidia/LocateAnything-3B").strip()

    def health(self) -> dict[str, Any]:
        return {
            "required": True,
            "execution_mode": self.execution_mode,
            "available": False,
            "status": "GROUNDING_UNAVAILABLE",
            "model_loaded": False,
            "inference_ready": False,
            # Flat keys retained for existing health_probe / Nest consumers
            "locate_anything": False,
            "locate_model_loaded": False,
            "locate_mode": self.generation_mode,
            "locate_model": self.model_id,
            "locate_model_revision": self.model_id,
            "locate_status": "GROUNDING_UNAVAILABLE",
            "locate_notes": [self.reason, "no_invented_boxes"],
            "device": "none",
        }

    def locate_text(self, *, header: str, tiles: list[dict[str, Any]], tile_images=None, mode=None):
        return empty_locate_payload(
            header=header,
            generation_mode=mode or self.generation_mode,
            notes=[self.reason, "locate_text_skipped"],
            model=self.model_id,
        )

    def locate_physical_tb_group(
        self, *, header: str, tiles: list[dict[str, Any]], tile_images=None, mode=None,
    ):
        return empty_locate_payload(
            header=header,
            generation_mode=mode or self.generation_mode,
            notes=[self.reason, "locate_physical_skipped"],
            model=self.model_id,
        )

    def analyse_tile(self, *, header: str, tile: dict[str, Any], image_bytes=None, mode=None):
        return empty_locate_payload(
            header=header,
            generation_mode=mode or self.generation_mode,
            notes=[self.reason, f"analyse_tile_skipped:{tile.get('tile_id')}"],
            model=self.model_id,
        )


class RemoteLocateAnythingProvider(VisualGroundingProvider):
    """
    Stub client for future POST /grounding/locate on a cloud NVIDIA GPU worker.

    Env:
      DWES_GROUNDING_REMOTE_URL  — base URL (e.g. https://gpu.example/grounding)
      DWES_GROUNDING_REMOTE_TOKEN — optional bearer token (worker auth only; never DB/JWT)

    If URL unset or request fails → same as UnavailableGroundingProvider.
    Worker must never receive DB URLs, Nest JWTs, or session data.
    """

    def __init__(self) -> None:
        self.execution_mode = "remote_gpu"
        self.generation_mode = (os.environ.get("DWES_LOCATE_MODE") or "hybrid").strip() or "hybrid"
        self.model_id = (os.environ.get("DWES_LOCATE_MODEL") or "nvidia/LocateAnything-3B").strip()
        self.base_url = (os.environ.get("DWES_GROUNDING_REMOTE_URL") or "").strip().rstrip("/")
        self.token = (os.environ.get("DWES_GROUNDING_REMOTE_TOKEN") or "").strip()
        self._fallback = UnavailableGroundingProvider(
            execution_mode="remote_gpu",
            reason="remote_url_unset_or_unreachable",
        )

    def health(self) -> dict[str, Any]:
        if not self.base_url:
            h = self._fallback.health()
            h["execution_mode"] = "remote_gpu"
            h["locate_notes"] = ["DWES_GROUNDING_REMOTE_URL unset", "GROUNDING_UNAVAILABLE"]
            return h
        try:
            req = urllib.request.Request(
                f"{self.base_url}/health",
                method="GET",
                headers=self._headers(),
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = json.loads(resp.read().decode("utf-8") or "{}")
            available = bool(body.get("available") or body.get("inference_ready"))
            return {
                "required": True,
                "execution_mode": "remote_gpu",
                "available": available,
                "status": "LOCATE_READY" if available else "GROUNDING_UNAVAILABLE",
                "model_loaded": bool(body.get("model_loaded")),
                "inference_ready": bool(body.get("inference_ready")),
                "locate_anything": available,
                "locate_model_loaded": bool(body.get("model_loaded")),
                "locate_mode": self.generation_mode,
                "locate_model": body.get("model") or self.model_id,
                "locate_model_revision": body.get("model_revision") or self.model_id,
                "locate_status": "LOCATE_READY" if available else "GROUNDING_UNAVAILABLE",
                "locate_notes": list(body.get("notes") or []),
                "device": body.get("device") or "remote_gpu",
            }
        except Exception as exc:  # noqa: BLE001
            h = self._fallback.health()
            h["execution_mode"] = "remote_gpu"
            h["locate_notes"] = [f"remote_health_failed:{exc}", "GROUNDING_UNAVAILABLE"]
            return h

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _post_locate(
        self,
        *,
        header: str,
        prompt_kind: str,
        tiles: list[dict[str, Any]],
        mode: str | None,
        tile: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Future request schema (documented + stub):

        POST {base}/locate
        {
          "header": "X9",
          "prompt_kind": "text"|"physical"|"tile",
          "generation_mode": "hybrid"|"text"|"physical"|"slow",
          "tiles": [{ "tile_id", "page", "x", "y", "width", "height" }],
          "tile": { ... } | null,
          "model": "...",
          "pipeline_version": "..."
        }

        Response (boxes/evidence only — never DB writes):
        {
          "locate_status": "LOCATE_COMPLETE"|"LOCATE_FAILED"|"GROUNDING_UNAVAILABLE",
          "text_hits": [],
          "physical_hits": [],
          "model_revision": "...",
          "inference_time_ms": 0,
          "device": "cuda",
          "notes": []
        }
        """
        if not self.base_url:
            return empty_locate_payload(
                header=header,
                generation_mode=mode or self.generation_mode,
                notes=["DWES_GROUNDING_REMOTE_URL unset"],
                model=self.model_id,
            )
        payload = {
            "header": header,
            "prompt_kind": prompt_kind,
            "generation_mode": mode or self.generation_mode,
            "tiles": [
                {
                    "tile_id": t.get("tile_id"),
                    "page": t.get("page"),
                    "x": t.get("x"),
                    "y": t.get("y"),
                    "width": t.get("width"),
                    "height": t.get("height"),
                }
                for t in (tiles or [])[:64]
            ],
            "tile": (
                {
                    "tile_id": tile.get("tile_id"),
                    "page": tile.get("page"),
                    "x": tile.get("x"),
                    "y": tile.get("y"),
                    "width": tile.get("width"),
                    "height": tile.get("height"),
                }
                if tile
                else None
            ),
            "model": self.model_id,
            "pipeline_version": PIPELINE_VERSION,
            # Explicitly omit credentials / DB / session
        }
        t0 = time.time()
        try:
            req = urllib.request.Request(
                f"{self.base_url}/locate",
                data=json.dumps(payload).encode("utf-8"),
                headers=self._headers(),
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read().decode("utf-8") or "{}")
            text_hits = list(body.get("text_hits") or [])
            physical_hits = list(body.get("physical_hits") or [])
            # Never accept invented absolute paths or DB side-effects from worker
            status = str(body.get("locate_status") or "LOCATE_FAILED")
            unavailable = status in ("GROUNDING_UNAVAILABLE", "LOCATE_UNAVAILABLE") or (
                not text_hits and not physical_hits and status != "LOCATE_COMPLETE"
            )
            return {
                "header": header,
                "locate_status": "GROUNDING_UNAVAILABLE" if unavailable and status.startswith("LOCATE_UN") else status,
                "locate_model": body.get("model") or self.model_id,
                "locate_model_revision": body.get("model_revision") or self.model_id,
                "generation_mode": mode or self.generation_mode,
                "inference_time_ms": int(body.get("inference_time_ms") or ((time.time() - t0) * 1000)),
                "device": body.get("device") or "remote_gpu",
                "text_hits": text_hits,
                "physical_hits": physical_hits,
                "notes": list(body.get("notes") or []),
                "grounding_unavailable": unavailable and not (text_hits or physical_hits),
                "execution_mode": "remote_gpu",
            }
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, OSError) as exc:
            return empty_locate_payload(
                header=header,
                generation_mode=mode or self.generation_mode,
                notes=[f"remote_locate_failed:{exc}"],
                model=self.model_id,
                device="remote_gpu",
            )

    def locate_text(self, *, header: str, tiles: list[dict[str, Any]], tile_images=None, mode=None):
        result = self._post_locate(header=header, prompt_kind="text", tiles=tiles, mode=mode)
        # Physical hits ignored for text-only call
        result["physical_hits"] = []
        return result

    def locate_physical_tb_group(
        self, *, header: str, tiles: list[dict[str, Any]], tile_images=None, mode=None,
    ):
        result = self._post_locate(header=header, prompt_kind="physical", tiles=tiles, mode=mode)
        result["text_hits"] = []
        return result

    def analyse_tile(self, *, header: str, tile: dict[str, Any], image_bytes=None, mode=None):
        # image_bytes intentionally not POSTed in stub without object-storage refs —
        # future worker should fetch tile by storage key, not raw Windows paths.
        return self._post_locate(
            header=header,
            prompt_kind="tile",
            tiles=[tile] if tile else [],
            tile=tile,
            mode=mode,
        )


def get_visual_grounding_provider() -> VisualGroundingProvider:
    """
    Select provider by DWES_GROUNDING_EXECUTION_MODE.

    future_cloud (default on laptop) → UnavailableGroundingProvider
    remote_gpu → RemoteLocateAnythingProvider (falls back if URL unset)
    local → LocalLocateAnythingProvider (GPU co-located hosts only)
    """
    mode = grounding_execution_mode()
    if mode == "remote_gpu":
        return RemoteLocateAnythingProvider()
    if mode == "local":
        from locate_anything import LocalLocateAnythingProvider

        return LocalLocateAnythingProvider()
    return UnavailableGroundingProvider(execution_mode="future_cloud")
