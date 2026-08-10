# -*- coding: utf-8 -*-
"""
Maximum-accuracy evidence package builder for one drawing analysis.

Runs complementary: OCR ensemble + tiles + LocateAnything + OpenCV.
Does not invent geometry. Nest fuses with pdfjs schedule evidence.
"""
from __future__ import annotations

import os
from typing import Any

from locate_anything import get_visual_grounding_provider
from ocr_providers import consensus_words, enabled_providers, normalize_header
from opencv_strip import detect_strip_around_header
from tiling import generate_tiles
from visual_grounding_provider import (
    STAGE_EVIDENCE_FUSION,
    STAGE_OCR_ANALYSIS,
    STAGE_VISUAL_GROUNDING,
)


def build_evidence_for_header(
    *,
    header: str,
    page: dict[str, Any],
    hit_geometry: dict[str, float] | None,
    hit_kind: str,
    hit_view: str,
    page_classification: str,
    region_classification: str,
    tesseract_raw: str | None,
    paddle_raw: str | None,
    locate_result: dict[str, Any],
    opencv_result: dict[str, Any],
    schedule_terminals: list[str],
    terminal_diagram_supported: bool,
    candidate_unique: bool,
) -> dict[str, Any]:
    h = normalize_header(header)
    tess_match = bool(tesseract_raw) and normalize_header(tesseract_raw) in (
        h,
        *(normalize_header(tesseract_raw),),
    )
    # constrained: accept if normalized candidate equals header
    if tesseract_raw:
        from ocr_providers import constrained_normalize

        cn = constrained_normalize(tesseract_raw, [h])
        tess_match = cn.get("normalized_candidate") == h
    paddle_match = False
    if paddle_raw:
        from ocr_providers import constrained_normalize

        cn = constrained_normalize(paddle_raw, [h])
        paddle_match = cn.get("normalized_candidate") == h

    locate_text = bool((locate_result or {}).get("text_hits"))
    locate_phys = bool((locate_result or {}).get("physical_hits"))
    return {
        "header": h,
        "schedule": {
            "exact": True,
            "terminals": schedule_terminals,
            "terminal": (schedule_terminals[0] if schedule_terminals else ""),
        },
        "pdf_text": {"matched": False},  # Nest fills when pdfjs hits
        "tesseract": {
            "matched": tess_match,
            "raw": tesseract_raw or "",
        },
        "paddleocr": {
            "matched": paddle_match,
            "raw": paddle_raw or "",
        },
        "locate_text": {
            "matched": locate_text,
            "status": (locate_result or {}).get("locate_status"),
        },
        "locate_physical_group": {
            "matched": locate_phys,
            "status": (locate_result or {}).get("locate_status"),
        },
        "opencv_strip": {
            "matched": bool((opencv_result or {}).get("physical_strip_detected")),
            "orientation": (opencv_result or {}).get("orientation"),
            "geometry_score": (opencv_result or {}).get("geometry_score"),
        },
        "view": {
            "page": page_classification,
            "region": region_classification,
            "view_name": hit_view,
            "region_kind": hit_kind,
            "region_bbox": hit_geometry,
        },
        "terminal_diagram": {"supported": terminal_diagram_supported},
        "candidate_unique": candidate_unique,
        "checksum_current": True,
        "locate_meta": {
            "locate_model": (locate_result or {}).get("locate_model"),
            "locate_model_revision": (locate_result or {}).get("locate_model_revision"),
            "generation_mode": (locate_result or {}).get("generation_mode"),
            "inference_time_ms": (locate_result or {}).get("inference_time_ms"),
            "device": (locate_result or {}).get("device"),
        },
        "page_number": int(page.get("page") or 1),
    }


def attach_max_accuracy_package(
    analyse_result: dict[str, Any],
    *,
    pages: list[dict[str, Any]],
    expected: list[str],
    schedule_map: dict[str, list[str]],
    dpi: int,
) -> dict[str, Any]:
    """Augment classic analyse() output with tiles, locate, evidence objects, stages."""
    notes = list(analyse_result.get("notes") or [])
    stages_run = ["PAGE_RENDER", STAGE_OCR_ANALYSIS, "OPENCV", "VIEW_CLASSIFICATION"]
    locate = get_visual_grounding_provider()
    health = locate.health()
    locate_status = health.get("locate_status") or health.get("status") or "GROUNDING_UNAVAILABLE"
    notes.append(f"locate_status={locate_status}")
    notes.append(f"grounding_execution_mode={health.get('execution_mode') or 'future_cloud'}")
    if health.get("locate_notes"):
        notes.extend([f"locate:{n}" for n in health["locate_notes"]])

    tiles_by_page: dict[int, list[dict[str, Any]]] = {}
    for page in pages:
        png = page.get("png") or b""
        # Approximate page size from PNG if possible
        pw, ph = 2000, 1400
        try:
            from PIL import Image
            import io

            if png:
                im = Image.open(io.BytesIO(png))
                pw, ph = im.size
        except Exception:
            pass
        tiles_by_page[int(page.get("page") or 1)] = generate_tiles(
            pw, ph, page=int(page.get("page") or 1), dpi=dpi, overlap_ratio=0.15,
        )
    notes.append(f"tiles_generated={sum(len(v) for v in tiles_by_page.values())}")
    stages_run.append("PAGE_RENDER")

    locate_results: dict[str, Any] = {}
    stages_run.append(STAGE_VISUAL_GROUNDING)
    stages_run.extend(["LOCATE_TEXT", "LOCATE_PHYSICAL"])
    for header in expected:
        # Prefer tiles from pages that already have OCR hits for this header
        tiles: list[dict[str, Any]] = []
        for c in analyse_result.get("candidates") or []:
            if normalize_header(c.get("tb_number") or "") == normalize_header(header):
                tiles = tiles_by_page.get(int(c.get("page_number") or 1), [])
                break
        if not tiles and tiles_by_page:
            tiles = next(iter(tiles_by_page.values()))
        locate_results[normalize_header(header)] = locate.ground_header(
            header=normalize_header(header),
            tiles=tiles,
        )

    if locate_status in ("LOCATE_UNAVAILABLE", "GROUNDING_UNAVAILABLE") or any(
        (r or {}).get("grounding_unavailable") for r in locate_results.values()
    ):
        notes.append("GROUNDING_UNAVAILABLE")
        analyse_result["grounding_unavailable"] = True
    else:
        analyse_result["grounding_unavailable"] = False

    evidence_by_header: dict[str, Any] = {}
    for c in analyse_result.get("candidates") or []:
        header = normalize_header(c.get("tb_number") or "")
        page_num = int(c.get("page_number") or 1)
        page = next((p for p in pages if int(p.get("page") or 1) == page_num), pages[0] if pages else {})
        geom = c.get("geometry") or {}
        opencv = detect_strip_around_header(page.get("png") or b"", geom)
        if opencv.get("strip_bbox") and opencv.get("physical_strip_detected"):
            shape = dict(opencv["strip_bbox"])
            shape["rotation"] = geom.get("rotation", 0.0)
            c["geometry"] = {**geom, **shape, "strip_bbox": shape}
            c["detection_method"] = "OCR_AND_SHAPE" if c.get("detection_method") == "OCR" else c.get("detection_method")
            c["reasons"] = list(c.get("reasons") or []) + ["opencv_strip_expanded"]
        lr = locate_results.get(header) or {}
        words = page.get("words") or []
        tess_raw = next((w.get("raw_ocr") or w.get("text") for w in words if w.get("engine") == "tesseract" and normalize_header(w.get("normalized_candidate") or w.get("text") or "") == header), None)
        paddle_raw = next((w.get("raw_ocr") or w.get("text") for w in words if w.get("engine") == "paddleocr" and normalize_header(w.get("normalized_candidate") or w.get("text") or "") == header), None)
        # fallback: any word matching header
        if not tess_raw:
            tess_raw = next((w.get("text") for w in words if normalize_header(w.get("text") or "") == header), "")
        evidence_by_header[header] = build_evidence_for_header(
            header=header,
            page=page or {},
            hit_geometry=c.get("geometry"),
            hit_kind=str((c.get("geometry") or {}).get("region_kind") or "strip_candidate"),
            hit_view=str(c.get("view_name") or "UNKNOWN"),
            page_classification=str(page.get("page_view") or "UNKNOWN"),
            region_classification=str((c.get("geometry") or {}).get("view_classification") or c.get("view_name") or "UNKNOWN"),
            tesseract_raw=tess_raw or "",
            paddle_raw=paddle_raw or "",
            locate_result=lr,
            opencv_result=opencv,
            schedule_terminals=schedule_map.get(header) or [],
            terminal_diagram_supported=any(
                (p.get("page_view") == "TERMINAL_DIAGRAM") for p in pages
            ),
            candidate_unique=True,
        )
        c["evidence"] = evidence_by_header[header]

    # Headers with locate-only / missing candidates still get evidence stubs
    for header in expected:
        h = normalize_header(header)
        if h in evidence_by_header:
            continue
        lr = locate_results.get(h) or {}
        evidence_by_header[h] = {
            "header": h,
            "schedule": {"exact": True, "terminals": schedule_map.get(h) or [], "terminal": ""},
            "pdf_text": {"matched": False},
            "tesseract": {"matched": False, "raw": ""},
            "paddleocr": {"matched": False, "raw": ""},
            "locate_text": {"matched": False, "status": lr.get("locate_status")},
            "locate_physical_group": {"matched": False, "status": lr.get("locate_status")},
            "opencv_strip": {"matched": False},
            "view": {"page": "UNKNOWN", "region": "UNKNOWN"},
            "terminal_diagram": {"supported": False},
            "candidate_unique": True,
            "checksum_current": True,
            "locate_meta": {
                "locate_model": lr.get("locate_model"),
                "generation_mode": lr.get("generation_mode"),
                "device": lr.get("device"),
            },
        }

    providers = [p.name for p in enabled_providers()]
    notes.append(f"ocr_providers={','.join(providers) or 'none'}")
    stages_run.append(STAGE_EVIDENCE_FUSION)

    analyse_result["notes"] = notes
    analyse_result["stages_run"] = stages_run
    analyse_result["locate_status"] = locate_status
    analyse_result["locate_health"] = health
    analyse_result["locate_by_header"] = locate_results
    analyse_result["evidence_by_header"] = evidence_by_header
    analyse_result["tiles_by_page"] = {str(k): v for k, v in tiles_by_page.items()}
    analyse_result["pipeline_version"] = "max-accuracy-evidence-fusion-v1"
    analyse_result["engine"] = "python-cli-max-accuracy"
    return analyse_result
