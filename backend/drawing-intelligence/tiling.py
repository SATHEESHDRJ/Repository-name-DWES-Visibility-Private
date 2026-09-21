# -*- coding: utf-8 -*-
"""Overlapping high-resolution tiles for engineering drawings."""
from __future__ import annotations

from typing import Any


def generate_tiles(
    page_width_px: int,
    page_height_px: int,
    *,
    page: int,
    dpi: int,
    rotation: float = 0.0,
    tile_size: int = 1024,
    overlap_ratio: float = 0.15,
) -> list[dict[str, Any]]:
    """
    Create overlapping tile metadata. Coordinates are page-pixel space.
    Overlay consumers must map via origin_x/origin_y — never store tile-local
    coords as final TB_GROUP geometry.
    """
    if page_width_px <= 0 or page_height_px <= 0:
        return []
    overlap = max(0.0, min(0.45, float(overlap_ratio)))
    step = max(64, int(tile_size * (1.0 - overlap)))
    tiles: list[dict[str, Any]] = []
    tid = 0
    y = 0
    while y < page_height_px:
        x = 0
        h = min(tile_size, page_height_px - y)
        while x < page_width_px:
            w = min(tile_size, page_width_px - x)
            tiles.append({
                "page": int(page),
                "tile_id": f"p{page}_t{tid}",
                "origin_x": int(x),
                "origin_y": int(y),
                "width": int(w),
                "height": int(h),
                "page_width": int(page_width_px),
                "page_height": int(page_height_px),
                "dpi": int(dpi),
                "rotation": float(rotation),
            })
            tid += 1
            if x + w >= page_width_px:
                break
            x += step
        if y + h >= page_height_px:
            break
        y += step
    return tiles


def tile_local_to_page_norm(
    tile: dict[str, Any],
    local_x: float,
    local_y: float,
    local_w: float,
    local_h: float,
) -> dict[str, float]:
    """Convert tile-local pixel box to page-normalized 0..1 geometry."""
    pw = max(1, int(tile.get("page_width") or 1))
    ph = max(1, int(tile.get("page_height") or 1))
    ox = float(tile.get("origin_x") or 0)
    oy = float(tile.get("origin_y") or 0)
    return {
        "x": (ox + local_x) / pw,
        "y": (oy + local_y) / ph,
        "width": max(0.001, local_w / pw),
        "height": max(0.001, local_h / ph),
        "rotation": float(tile.get("rotation") or 0.0),
    }
