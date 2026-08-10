"""Extrude verified footprints into Flat 3D parts. Never invent random cubes."""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any
from .stages import Confidence

AUTHORITATIVE = {Confidence.CONFIRMED.value}


def load_depth_library(path: str | None) -> dict[str, Any]:
    p = Path(path) if path else Path(__file__).resolve().parent.parent / "rules" / "device-depth-library.json"
    return json.loads(p.read_text(encoding="utf-8"))


def generate_flat3d(
    normalized: dict[str, Any],
    objects: list[dict[str, Any]],
    depth_lib: dict[str, Any],
    *,
    allow_high_confidence_as_suggested: bool = True,
) -> dict[str, Any]:
    depths = (depth_lib.get("depths") or {})
    extents = normalized.get("panel_extents_mm") or {}
    panel_w = float(extents.get("width") or 0)
    panel_h = float(extents.get("height") or 0)
    panel_d = 200.0  # default backplate depth mm when envelope depth unknown — marked LIBRARY_DEFAULT

    parts: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    warnings: list[str] = []

    # Panel backplate from envelope or extents
    env = next((o for o in objects if o.get("kind") == "panel_envelope"), None)
    if env and env.get("confidence") in (Confidence.CONFIRMED.value, Confidence.HIGH_CONFIDENCE.value):
        fp = env["footprint"]
        parts.append(_box("panel_backplate", fp, panel_d, "LIBRARY_DEFAULT", env, authoritative=True))
    elif panel_w > 0 and panel_h > 0:
        parts.append({
            "name": "panel_backplate",
            "kind": "panel_backplate",
            "cx": panel_w / 2, "cy": panel_h / 2, "cz": panel_d / 2,
            "sx": panel_w, "sy": panel_h, "sz": panel_d,
            "depth_source": "LIBRARY_DEFAULT",
            "confidence": Confidence.REVIEW_REQUIRED.value,
            "source_handle": None,
            "device_tag": None,
            "authoritative": False,
        })
        warnings.append("Panel envelope not CONFIRMED; backplate from drawing extents only (REVIEW_REQUIRED).")
    else:
        warnings.append("No valid panel extents — cannot generate Flat 3D backplate.")

    for obj in objects:
        if obj.get("kind") == "panel_envelope":
            continue
        conf = obj.get("confidence")
        if conf not in AUTHORITATIVE:
            if allow_high_confidence_as_suggested and conf == Confidence.HIGH_CONFIDENCE.value:
                # Included as non-authoritative suggestion for review only
                pass
            else:
                rejected.append({"reason": "not_confirmed", "object": obj})
                continue
        kind = obj.get("kind") or "device"
        depth_entry = depths.get(kind) or depths.get("device") or {"depth_mm": 90, "source": "LIBRARY_DEFAULT"}
        depth = float(depth_entry["depth_mm"])
        depth_source = str(depth_entry.get("source") or "LIBRARY_DEFAULT")
        auth = conf in AUTHORITATIVE
        parts.append(_box(kind, obj["footprint"], depth, depth_source, obj, authoritative=auth, rotation=obj.get("rotation_deg") or 0))

    authoritative_count = sum(1 for p in parts if p.get("authoritative"))
    return {
        "parts": parts,
        "rejected": rejected,
        "warnings": warnings,
        "authoritative_part_count": authoritative_count,
        "suggested_part_count": len(parts) - authoritative_count,
        "panel": {"width": panel_w, "height": panel_h, "depth": panel_d, "units": "mm"},
    }


def _box(kind, fp, depth, depth_source, obj, authoritative: bool, rotation: float = 0.0) -> dict[str, Any]:
    return {
        "name": f"{kind}:{obj.get('device_tag') or obj.get('source_handle') or 'anon'}",
        "kind": kind,
        "cx": float(fp["cx"]), "cy": float(fp["cy"]), "cz": depth / 2,
        "sx": float(fp["width"]), "sy": float(fp["height"]), "sz": float(depth),
        "rotation_deg": float(rotation),
        "depth_source": depth_source,
        "confidence": obj.get("confidence"),
        "source_handle": obj.get("source_handle"),
        "source_layer": obj.get("source_layer"),
        "device_tag": obj.get("device_tag"),
        "authoritative": authoritative,
        "evidence": obj.get("evidence") or [],
    }