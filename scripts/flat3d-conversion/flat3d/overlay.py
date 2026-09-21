"""Geometric overlay: 2D extents vs Flat 3D top projection — measurable, not screenshot-only."""
from __future__ import annotations
from typing import Any
import math


def compare_overlay(normalized: dict[str, Any], flat: dict[str, Any]) -> dict[str, Any]:
    extents = normalized.get("panel_extents_mm") or {}
    panel_w = float(extents.get("width") or 0)
    panel_h = float(extents.get("height") or 0)
    parts = [p for p in flat.get("parts", []) if p.get("kind") != "panel_backplate"]
    drawing_devices = [
        e for e in normalized.get("entities", [])
        if e.get("type") == "INSERT" and e.get("width_mm") and e.get("height_mm")
    ]

    matched = 0
    missing = 0
    pos_devs = []
    size_devs = []
    for e in drawing_devices:
        ix, iy = e["insert"][0], e["insert"][1]
        best = None
        best_d = 1e18
        for p in parts:
            d = (p["cx"] - ix) ** 2 + (p["cy"] - iy) ** 2
            if d < best_d:
                best_d = d
                best = p
        if best is None or math.sqrt(best_d) > 50.0:
            missing += 1
            continue
        matched += 1
        pos_devs.append(math.sqrt(best_d))
        dw = abs(best["sx"] - float(e["width_mm"]))
        dh = abs(best["sy"] - float(e["height_mm"]))
        size_devs.append(max(dw, dh))

    total = max(1, len(drawing_devices))
    return {
        "panel_bounds_mm": {"width": panel_w, "height": panel_h},
        "drawing_insert_count": len(drawing_devices),
        "flat3d_part_count": len(parts),
        "matched_device_pct": round(100.0 * matched / total, 2),
        "missing_device_pct": round(100.0 * missing / total, 2),
        "positional_deviation_mm": {
            "mean": round(sum(pos_devs) / len(pos_devs), 3) if pos_devs else None,
            "max": round(max(pos_devs), 3) if pos_devs else None,
        },
        "size_deviation_mm": {
            "mean": round(sum(size_devs) / len(size_devs), 3) if size_devs else None,
            "max": round(max(size_devs), 3) if size_devs else None,
        },
        "unresolved_object_count": sum(1 for p in flat.get("parts", []) if not p.get("authoritative")),
    }