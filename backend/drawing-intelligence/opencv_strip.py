# -*- coding: utf-8 -*-
"""OpenCV physical terminal-strip validation and text→group expansion."""
from __future__ import annotations

from typing import Any


def detect_strip_around_header(
    page_png_bytes: bytes,
    header_box: dict[str, float] | None,
) -> dict[str, Any]:
    """
    Always attempt geometry validation for fusion (not optional for max-accuracy path).
    Returns physical_strip_detected, strip_bbox, orientation, cell_count_estimate, scores.
    """
    out: dict[str, Any] = {
        "physical_strip_detected": False,
        "strip_bbox": None,
        "orientation": "unknown",
        "cell_count_estimate": 0,
        "spacing_score": 0.0,
        "geometry_score": 0.0,
        "notes": [],
    }
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except Exception as exc:  # noqa: BLE001
        out["notes"].append(f"opencv_unavailable:{exc}")
        return out
    try:
        arr = np.frombuffer(page_png_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            out["notes"].append("opencv_decode_failed")
            return out
        h, w = img.shape[:2]
        if h < 32 or w < 32:
            return out
        x0, y0, x1, y1 = 0, 0, w, h
        if header_box:
            def _safe_px(norm: float, dim: int, fallback: int) -> int:
                try:
                    v = float(norm)
                except (TypeError, ValueError):
                    return fallback
                if v != v or v in (float("inf"), float("-inf")):
                    return fallback
                return int(max(0.0, min(1.0, v)) * dim)

            cx = _safe_px(header_box.get("x", 0.5), w, w // 2)
            cy = _safe_px(header_box.get("y", 0.5), h, h // 2)
            bw = max(_safe_px(header_box.get("width", 0.05), w, 40), 40)
            bh = max(_safe_px(header_box.get("height", 0.03), h, 20), 20)
            pad_x = max(bw * 8, int(w * 0.08))
            pad_y = max(bh * 6, int(h * 0.06))
            x0 = max(0, cx - pad_x)
            y0 = max(0, cy - pad_y)
            x1 = min(w, cx + pad_x)
            y1 = min(h, cy + pad_y)
        roi = img[y0:y1, x0:x1]
        blur = cv2.GaussianBlur(roi, (3, 3), 0)
        edges = cv2.Canny(blur, 40, 120)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=1)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cells: list[tuple[int, int, int, int]] = []
        for c in contours:
            x, y, cw, ch = cv2.boundingRect(c)
            area = cw * ch
            if area < 80 or area > (roi.shape[0] * roi.shape[1] * 0.15):
                continue
            aspect = cw / max(ch, 1)
            if 0.25 <= aspect <= 4.0 and cw >= 8 and ch >= 8:
                cells.append((x, y, cw, ch))
        out["cell_count_estimate"] = len(cells)
        if len(cells) < 4:
            out["notes"].append("opencv_cells_insufficient")
            return out
        heights = [c[3] for c in cells]
        med_h = float(np.median(heights))
        similar = [c for c in cells if abs(c[3] - med_h) <= med_h * 0.45]
        if len(similar) < 4:
            out["notes"].append("opencv_no_regular_row")
            return out
        orientation = "horizontal"
        spacing_score = 0.0
        xs = sorted(c[0] for c in similar)
        gaps = [xs[i + 1] - xs[i] for i in range(len(xs) - 1) if xs[i + 1] - xs[i] > 2]
        strong = False
        if len(gaps) >= 3:
            med_gap = float(np.median(gaps))
            regular = sum(1 for g in gaps if abs(g - med_gap) <= med_gap * 0.4)
            spacing_score = regular / max(1, len(gaps))
            strong = regular >= max(3, int(len(gaps) * 0.6))
        if not strong:
            orientation = "vertical"
            similar_v = sorted(similar, key=lambda t: t[1])
            ys = [c[1] for c in similar_v]
            vgaps = [ys[i + 1] - ys[i] for i in range(len(ys) - 1) if ys[i + 1] - ys[i] > 2]
            if len(vgaps) >= 3:
                med_gap = float(np.median(vgaps))
                regular = sum(1 for g in vgaps if abs(g - med_gap) <= med_gap * 0.4)
                spacing_score = regular / max(1, len(vgaps))
                strong = regular >= max(3, int(len(vgaps) * 0.6))
        if not strong:
            out["notes"].append("opencv_spacing_irregular")
            out["spacing_score"] = spacing_score
            return out
        min_x = min(c[0] for c in similar) + x0
        min_y = min(c[1] for c in similar) + y0
        max_x = max(c[0] + c[2] for c in similar) + x0
        max_y = max(c[1] + c[3] for c in similar) + y0
        geom = {
            "x": min_x / w,
            "y": min_y / h,
            "width": max(0.01, (max_x - min_x) / w),
            "height": max(0.01, (max_y - min_y) / h),
            "rotation": float(header_box.get("rotation", 0.0) if header_box else 0.0),
        }
        out.update({
            "physical_strip_detected": True,
            "strip_bbox": geom,
            "orientation": orientation,
            "cell_count_estimate": len(similar),
            "spacing_score": float(spacing_score),
            "geometry_score": min(1.0, 0.5 + spacing_score * 0.5),
        })
        out["notes"].append("opencv_strip_detected")
        return out
    except Exception as exc:  # noqa: BLE001
        out["notes"].append(f"opencv_error:{exc}")
        return out
