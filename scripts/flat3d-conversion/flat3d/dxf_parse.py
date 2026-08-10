"""DXF parsing via ezdxf — no C++ / Open CASCADE for ordinary DXF."""
from __future__ import annotations
import math
from typing import Any

try:
    import ezdxf
    from ezdxf import units as ez_units
except ImportError as e:  # pragma: no cover
    raise SystemExit("ezdxf is required: pip install -r scripts/flat3d-conversion/requirements.txt") from e


def _insunits_to_mm_scale(doc) -> tuple[str, float]:
    try:
        code = int(doc.header.get("$INSUNITS", 0) or 0)
    except Exception:
        code = 0
    # ezdxf unit enum → mm factor
    mapping = {
        0: ("unitless", 1.0),
        1: ("inches", 25.4),
        2: ("feet", 304.8),
        4: ("mm", 1.0),
        5: ("cm", 10.0),
        6: ("m", 1000.0),
    }
    name, scale = mapping.get(code, ("unitless", 1.0))
    return name, float(scale)


def parse_dxf(path: str) -> dict[str, Any]:
    doc = ezdxf.readfile(path)
    msp = doc.modelspace()
    unit_name, to_mm = _insunits_to_mm_scale(doc)
    layers = []
    for layer in doc.layers:
        layers.append({
            "name": layer.dxf.name,
            "on": not bool(getattr(layer, "is_off", False)),
            "frozen": bool(getattr(layer, "is_frozen", False)),
        })
    blocks = []
    for block in doc.blocks:
        if block.name.startswith("*"):
            continue
        blocks.append({"name": block.name, "entity_count": len(list(block))})

    entities: list[dict[str, Any]] = []
    texts: list[dict[str, Any]] = []

    def handle_of(e) -> str:
        try:
            return str(e.dxf.handle)
        except Exception:
            return ""

    def layer_of(e) -> str:
        try:
            return str(e.dxf.layer)
        except Exception:
            return ""

    for e in msp:
        et = e.dxftype()
        base = {
            "type": et,
            "handle": handle_of(e),
            "layer": layer_of(e),
            "source_space": "model",
        }
        if et == "LINE":
            entities.append({
                **base,
                "start": [e.dxf.start.x * to_mm, e.dxf.start.y * to_mm, e.dxf.start.z * to_mm],
                "end": [e.dxf.end.x * to_mm, e.dxf.end.y * to_mm, e.dxf.end.z * to_mm],
            })
        elif et in ("LWPOLYLINE", "POLYLINE"):
            try:
                pts = [[p[0] * to_mm, p[1] * to_mm, 0.0] for p in e.get_points("xy")]
            except Exception:
                pts = []
            closed = bool(getattr(e, "closed", False) or e.dxf.get("flags", 0) & 1)
            entities.append({**base, "points": pts, "closed": closed})
        elif et == "CIRCLE":
            entities.append({
                **base,
                "center": [e.dxf.center.x * to_mm, e.dxf.center.y * to_mm, e.dxf.center.z * to_mm],
                "radius": float(e.dxf.radius) * to_mm,
            })
        elif et == "ARC":
            entities.append({
                **base,
                "center": [e.dxf.center.x * to_mm, e.dxf.center.y * to_mm, e.dxf.center.z * to_mm],
                "radius": float(e.dxf.radius) * to_mm,
                "start_angle": float(e.dxf.start_angle),
                "end_angle": float(e.dxf.end_angle),
            })
        elif et == "SPLINE":
            entities.append({**base, "control_point_count": len(list(getattr(e, "control_points", []) or []))})
        elif et == "HATCH":
            entities.append({**base, "pattern": str(getattr(e.dxf, "pattern_name", "") or "")})
        elif et == "INSERT":
            name = str(e.dxf.name)
            sx = float(getattr(e.dxf, "xscale", 1.0) or 1.0)
            sy = float(getattr(e.dxf, "yscale", 1.0) or 1.0)
            rot = float(getattr(e.dxf, "rotation", 0.0) or 0.0)
            insert = [e.dxf.insert.x * to_mm, e.dxf.insert.y * to_mm, e.dxf.insert.z * to_mm]
            # Block extents when available
            width = height = None
            try:
                block = doc.blocks.get(name)
                if block is not None:
                    xs, ys = [], []
                    for be in block:
                        if be.dxftype() == "LINE":
                            xs += [be.dxf.start.x, be.dxf.end.x]
                            ys += [be.dxf.start.y, be.dxf.end.y]
                        elif be.dxftype() == "LWPOLYLINE":
                            for p in be.get_points("xy"):
                                xs.append(p[0]); ys.append(p[1])
                        elif be.dxftype() == "CIRCLE":
                            xs += [be.dxf.center.x - be.dxf.radius, be.dxf.center.x + be.dxf.radius]
                            ys += [be.dxf.center.y - be.dxf.radius, be.dxf.center.y + be.dxf.radius]
                    if xs and ys:
                        width = (max(xs) - min(xs)) * abs(sx) * to_mm
                        height = (max(ys) - min(ys)) * abs(sy) * to_mm
            except Exception:
                pass
            attrs = {}
            try:
                for a in e.attribs:
                    attrs[str(a.dxf.tag)] = str(a.dxf.text)
            except Exception:
                pass
            entities.append({
                **base,
                "block_name": name,
                "insert": insert,
                "rotation_deg": rot,
                "scale": [sx, sy],
                "width_mm": width,
                "height_mm": height,
                "attributes": attrs,
                "nested": True,
            })
        elif et in ("TEXT", "MTEXT"):
            try:
                content = e.dxf.text if et == "TEXT" else e.text
            except Exception:
                content = ""
            try:
                pos = e.dxf.insert if et == "TEXT" else e.dxf.insert
                xy = [pos.x * to_mm, pos.y * to_mm, getattr(pos, "z", 0.0) * to_mm]
            except Exception:
                xy = [0.0, 0.0, 0.0]
            texts.append({**base, "text": str(content), "position": xy})
        elif et in ("DIMENSION", "LEADER", "MULTILEADER"):
            entities.append({**base, "annotation": True})
        else:
            entities.append(base)

    return {
        "units_detected": unit_name,
        "to_mm_scale": to_mm,
        "layers": layers,
        "blocks": blocks,
        "entities": entities,
        "texts": texts,
        "entity_count": len(entities),
        "text_count": len(texts),
        "layer_count": len(layers),
        "block_def_count": len(blocks),
    }