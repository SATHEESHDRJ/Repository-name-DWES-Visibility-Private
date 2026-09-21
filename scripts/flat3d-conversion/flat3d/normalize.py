"""Normalize entities into panel-local millimetre coordinates with provenance."""
from __future__ import annotations
from typing import Any


def _bbox(parsed: dict[str, Any]) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    for e in parsed.get("entities", []):
        if "start" in e and "end" in e:
            xs += [e["start"][0], e["end"][0]]; ys += [e["start"][1], e["end"][1]]
        if "points" in e:
            for p in e["points"]:
                xs.append(p[0]); ys.append(p[1])
        if "center" in e and "radius" in e:
            r = e["radius"]; c = e["center"]
            xs += [c[0] - r, c[0] + r]; ys += [c[1] - r, c[1] + r]
        if "insert" in e:
            xs.append(e["insert"][0]); ys.append(e["insert"][1])
            if e.get("width_mm") and e.get("height_mm"):
                xs += [e["insert"][0] - e["width_mm"] / 2, e["insert"][0] + e["width_mm"] / 2]
                ys += [e["insert"][1] - e["height_mm"] / 2, e["insert"][1] + e["height_mm"] / 2]
    for t in parsed.get("texts", []):
        p = t.get("position") or [0, 0, 0]
        xs.append(p[0]); ys.append(p[1])
    if not xs or not ys:
        return 0.0, 0.0, 0.0, 0.0
    return min(xs), min(ys), max(xs), max(ys)


def normalize(parsed: dict[str, Any]) -> dict[str, Any]:
    min_x, min_y, max_x, max_y = _bbox(parsed)
    ox, oy = min_x, min_y
    width = max(0.0, max_x - min_x)
    height = max(0.0, max_y - min_y)

    def shift_xyz(v: list[float]) -> list[float]:
        return [v[0] - ox, v[1] - oy, v[2] if len(v) > 2 else 0.0]

    entities = []
    for e in parsed.get("entities", []):
        n = dict(e)
        n["source_handle"] = e.get("handle")
        n["source_layer"] = e.get("layer")
        if "start" in e: n["start"] = shift_xyz(e["start"])
        if "end" in e: n["end"] = shift_xyz(e["end"])
        if "points" in e: n["points"] = [shift_xyz(p) for p in e["points"]]
        if "center" in e: n["center"] = shift_xyz(e["center"])
        if "insert" in e: n["insert"] = shift_xyz(e["insert"])
        n["transform"] = {"origin_mm": [ox, oy, 0.0], "units": "mm"}
        entities.append(n)

    texts = []
    for t in parsed.get("texts", []):
        nt = dict(t)
        nt["position"] = shift_xyz(t.get("position") or [0, 0, 0])
        nt["source_handle"] = t.get("handle")
        nt["source_layer"] = t.get("layer")
        texts.append(nt)

    return {
        "coordinate_system": "panel-local-mm",
        "origin_from_drawing_mm": [ox, oy, 0.0],
        "panel_extents_mm": {"width": width, "height": height, "min": [0.0, 0.0], "max": [width, height]},
        "units_detected": parsed.get("units_detected"),
        "to_mm_scale": parsed.get("to_mm_scale"),
        "layers": parsed.get("layers", []),
        "blocks": parsed.get("blocks", []),
        "entities": entities,
        "texts": texts,
        "counts": {
            "entities": len(entities),
            "texts": len(texts),
            "layers": len(parsed.get("layers", [])),
            "blocks": len(parsed.get("blocks", [])),
        },
    }