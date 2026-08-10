# -*- coding: utf-8 -*-
"""Real readiness probes for drawing-intelligence /health."""
from __future__ import annotations

import os
from typing import Any

from visual_grounding_provider import (
    PIPELINE_VERSION,
    grounding_execution_mode,
    get_visual_grounding_provider,
)


def probe_tesseract() -> bool:
    try:
        import pytesseract
        from PIL import Image

        img = Image.new("L", (32, 32), 255)
        pytesseract.image_to_string(img)
        return True
    except Exception:
        return False


def probe_opencv() -> bool:
    try:
        import cv2  # noqa: F401
        import numpy as np

        arr = np.zeros((16, 16), dtype=np.uint8)
        _ = cv2.Canny(arr, 40, 120)
        return True
    except Exception:
        return False


def probe_paddleocr() -> bool:
    providers = (os.environ.get("DWES_OCR_PROVIDERS") or "tesseract").lower()
    if "paddle" not in providers:
        return False
    try:
        from paddleocr import PaddleOCR  # type: ignore  # noqa: F401

        return True
    except Exception:
        return False


def probe_cuda() -> tuple[bool, str]:
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            return True, name
        return False, "cpu"
    except Exception:
        return False, "unavailable"


def probe_locate_anything() -> dict[str, Any]:
    """
    Lightweight real probe via VisualGroundingProvider.
    App can be healthy while grounding is GROUNDING_UNAVAILABLE (future_cloud).
    """
    mode = grounding_execution_mode()
    gen = (os.environ.get("DWES_LOCATE_MODE") or "hybrid").strip() or "hybrid"
    model = (os.environ.get("DWES_LOCATE_MODEL") or "nvidia/LocateAnything-3B").strip()
    out: dict[str, Any] = {
        "required": True,
        "execution_mode": mode,
        "available": False,
        "status": "GROUNDING_UNAVAILABLE",
        "model_loaded": False,
        "inference_ready": False,
        "locate_anything": False,
        "locate_model_loaded": False,
        "locate_mode": gen,
        "locate_model": model,
        "locate_status": "GROUNDING_UNAVAILABLE",
        "locate_notes": [],
    }
    try:
        provider = get_visual_grounding_provider()
        probe = provider.health()
        out.update(probe)
        # Nested object for Nest / Supervisor debug (plan schema)
        out["locate_anything_detail"] = {
            "required": bool(probe.get("required", True)),
            "execution_mode": probe.get("execution_mode") or mode,
            "available": bool(probe.get("available") or probe.get("locate_anything")),
            "status": probe.get("status")
            or probe.get("locate_status")
            or "GROUNDING_UNAVAILABLE",
            "model_loaded": bool(probe.get("model_loaded") or probe.get("locate_model_loaded")),
            "inference_ready": bool(probe.get("inference_ready") or False),
        }
        return out
    except Exception as exc:  # noqa: BLE001
        out["locate_notes"].append(f"locate_import_failed:{exc}")
        out["locate_status"] = "GROUNDING_UNAVAILABLE"
        out["status"] = "GROUNDING_UNAVAILABLE"
        out["locate_anything_detail"] = {
            "required": True,
            "execution_mode": mode,
            "available": False,
            "status": "GROUNDING_UNAVAILABLE",
            "model_loaded": False,
            "inference_ready": False,
        }
        return out


def build_health() -> dict[str, Any]:
    tess = probe_tesseract()
    paddle = probe_paddleocr()
    opencv = probe_opencv()
    cuda, gpu = probe_cuda()
    locate = probe_locate_anything()
    detail = locate.get("locate_anything_detail") or {
        "required": True,
        "execution_mode": grounding_execution_mode(),
        "available": False,
        "status": "GROUNDING_UNAVAILABLE",
        "model_loaded": False,
        "inference_ready": False,
    }
    return {
        # App health is independent of grounding readiness
        "ok": True,
        "tesseract": tess,
        "paddleocr": paddle,
        "ocr": "ok" if tess else "missing",
        "opencv": opencv,
        "gpu": gpu,
        "cuda": cuda,
        # Flat locate fields (backward compatible)
        "locate_anything": bool(locate.get("locate_anything")),
        "locate_model_loaded": bool(locate.get("locate_model_loaded")),
        "locate_mode": locate.get("locate_mode") or "hybrid",
        "locate_model": locate.get("locate_model"),
        "locate_status": locate.get("locate_status") or "GROUNDING_UNAVAILABLE",
        "locate_notes": locate.get("locate_notes") or [],
        "locate_execution_mode": detail.get("execution_mode"),
        # Nested object (plan contract)
        "locate_anything_provider": detail,
        "pipeline_version": PIPELINE_VERSION,
    }
