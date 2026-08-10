"""Deterministic semantic classification — evidence-based, not AI fabrication."""
from __future__ import annotations
import json
import re
from pathlib import Path
from typing import Any
from .stages import Confidence

ENG_CHARS = set("=+-:/.")


def load_rules(path: str | None) -> dict[str, Any]:
    p = Path(path) if path else Path(__file__).resolve().parent.parent / "rules" / "semantic-rules.default.json"
    return json.loads(p.read_text(encoding="utf-8"))


def _norm_key(s: str) -> str:
    return re.sub(r"\s+", "", str(s or "")).upper()


def classify_objects(normalized: dict[str, Any], schedule_tags: set[str], rules: dict[str, Any]) -> list[dict[str, Any]]:
    layer_hints = { _norm_key(k): v for k, v in (rules.get("layer_hints") or {}).items() }
    block_hints = { _norm_key(k): v for k, v in (rules.get("block_name_hints") or {}).items() }
    texts = normalized.get("texts") or []
    objects: list[dict[str, Any]] = []

    # Candidate panel envelope: largest closed polyline
    closed = [e for e in normalized.get("entities", []) if e.get("type") in ("LWPOLYLINE", "POLYLINE") and e.get("closed") and len(e.get("points") or []) >= 3]
    if closed:
        def area(e):
            pts = e["points"]
            return abs(sum(pts[i][0]*pts[(i+1)%len(pts)][1] - pts[(i+1)%len(pts)][0]*pts[i][1] for i in range(len(pts)))) / 2
        env = max(closed, key=area)
        objects.append({
            "kind": "panel_envelope",
            "confidence": Confidence.HIGH_CONFIDENCE.value,
            "source_handle": env.get("source_handle"),
            "source_layer": env.get("source_layer"),
            "footprint": _poly_bounds(env["points"]),
            "rotation_deg": 0.0,
            "evidence": ["largest_closed_polyline"],
            "device_tag": None,
        })

    for e in normalized.get("entities", []):
        if e.get("type") != "INSERT":
            continue
        bname = str(e.get("block_name") or "")
        layer = str(e.get("source_layer") or "")
        attrs = e.get("attributes") or {}
        tag = None
        for k, v in attrs.items():
            if _norm_key(k) in ("TAG", "DEVICE", "DEVICETAG", "EQ", "MARK"):
                tag = str(v)
                break
        if not tag:
            # nearby text within 80 mm
            ix, iy = e.get("insert") or [0, 0, 0]
            for t in texts:
                tx, ty = (t.get("position") or [0, 0, 0])[:2]
                if (tx - ix) ** 2 + (ty - iy) ** 2 <= 80 ** 2:
                    raw = str(t.get("text") or "").strip()
                    if raw and any(c in raw for c in ENG_CHARS) or re.search(r"[A-Za-z0-9]", raw):
                        tag = raw
                        break
        dtype = block_hints.get(_norm_key(bname)) or layer_hints.get(_norm_key(layer)) or "device"
        conf = Confidence.UNRESOLVED.value
        evidence = [f"block:{bname}", f"layer:{layer}"]
        if tag and _norm_key(tag) in { _norm_key(x) for x in schedule_tags }:
            conf = Confidence.CONFIRMED.value
            evidence.append("exact_schedule_tag")
        elif tag and dtype != "device":
            conf = Confidence.HIGH_CONFIDENCE.value
            evidence.append("block_or_layer_hint_with_tag")
        elif dtype != "device":
            conf = Confidence.REVIEW_REQUIRED.value
            evidence.append("hint_without_schedule_match")
        elif tag:
            conf = Confidence.REVIEW_REQUIRED.value
            evidence.append("tag_without_schedule_match")

        w = e.get("width_mm") or 100.0
        h = e.get("height_mm") or 90.0
        ix, iy, iz = e.get("insert") or [0, 0, 0]
        objects.append({
            "kind": dtype,
            "confidence": conf,
            "source_handle": e.get("source_handle"),
            "source_layer": e.get("source_layer"),
            "block_name": bname,
            "device_tag": tag,
            "footprint": {
                "cx": ix, "cy": iy,
                "width": float(w), "height": float(h),
            },
            "rotation_deg": float(e.get("rotation_deg") or 0.0),
            "evidence": evidence,
        })

    # DIN rails / ducts from layer-named lines / closed polys
    for e in normalized.get("entities", []):
        layer = _norm_key(e.get("source_layer") or "")
        hint = layer_hints.get(layer)
        if hint == "din_rail" and e.get("type") == "LINE":
            objects.append({
                "kind": "din_rail",
                "confidence": Confidence.HIGH_CONFIDENCE.value,
                "source_handle": e.get("source_handle"),
                "source_layer": e.get("source_layer"),
                "footprint": _line_bounds(e["start"], e["end"], thickness=35.0),
                "rotation_deg": 0.0,
                "device_tag": None,
                "evidence": ["layer_din_rail"],
            })
        if hint == "duct" and e.get("closed") and e.get("points"):
            objects.append({
                "kind": "duct",
                "confidence": Confidence.HIGH_CONFIDENCE.value,
                "source_handle": e.get("source_handle"),
                "source_layer": e.get("source_layer"),
                "footprint": _poly_bounds(e["points"]),
                "rotation_deg": 0.0,
                "device_tag": None,
                "evidence": ["layer_duct_closed"],
            })

    return objects


def _poly_bounds(pts: list[list[float]]) -> dict[str, float]:
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    return {"cx": (minx + maxx) / 2, "cy": (miny + maxy) / 2, "width": maxx - minx, "height": maxy - miny}


def _line_bounds(a, b, thickness: float) -> dict[str, float]:
    return {
        "cx": (a[0] + b[0]) / 2,
        "cy": (a[1] + b[1]) / 2,
        "width": max(abs(b[0] - a[0]), thickness),
        "height": max(abs(b[1] - a[1]), thickness),
    }