# -*- coding: utf-8 -*-
"""DWES Drawing Intelligence Worker — hybrid OCR for non-searchable GA."""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Any


def normalize_header(value: str) -> str:
    return re.sub(r"\s+", "", (value or "").strip()).upper()


def classify_neighborhood(nearby_after: str) -> str:
    win = re.sub(r"\s+", "", (nearby_after or "").upper())
    if (
        re.match(r"^(TB-?(FEEDTHROUGH|KNIFE|DISCONNECT|TYPE)|FEEDTHROUGH|KNIFETYPE|DISCONNECTINGTYPE|TYPE-)", win)
        or re.search(r"TB-?(FEEDTHROUGH|KNIFE|DISCONNECT)", win[:48] or "")
        or re.search(r"(FEEDTHROUGH|DISCONNECTING|KNIFETYPE|SPARECIRCUIT)", win[:64] or "")
        or re.search(r"(BILLOFMATERIALS|DEVICEREF|COMPONENTLIST|PARTSLIST)", win[:80] or "")
    ):
        return "legend_or_table"
    if re.search(r"(DRAWINGNO|SHEET|SCALE|TITLEBLOCK|REVISION|REV-?\d|DRG\.?NO)", win[:80] or ""):
        return "title_block"
    if re.search(r"(NOTE:|REMARK|SEEDRAWING|REFERTO|TYPICAL)", win[:64] or ""):
        return "drawing_note"
    if re.search(r"(RELAY|CONTACTOR|MCB|FUSE|TRANSFORMER|METER|PLC|IOMODULE)", win[:64] or ""):
        return "equipment_label"
    if re.search(r"(\d{1,3})[-–—TO]{1,3}(\d{1,3})", win[:80] or ""):
        return "strip_candidate"
    if re.search(r"(?:^|[^0-9])(?:\d{1,2}[^0-9]+){4,}\d{1,2}", win[:120] or ""):
        return "strip_candidate"
    return "unknown"


def classify_page_view(compact: str) -> str:
    t = normalize_header(compact or "")
    if not t:
        return "UNKNOWN"
    rear_plan = bool(re.search(r"(REARVIEW|REARWIRING|REARSIDE|REARPLAN|WIRINGSIDE)", t))
    internal = bool(re.search(r"(INTERNALVIEW|INTERNALWIRING|TERMINALBLOCK|TBSTRIP|TERMINALSTRIP)", t))
    rear = rear_plan or internal
    front = bool(re.search(r"(FRONTVIEW|FRONTELEVATION|FRONTPANEL|RACKLAYOUT|EQUIPMENTLAYOUT|U-?POSITION|DEVICEARRANGEMENT)", t))
    legend = bool(re.search(r"(BILLOFMATERIALS|DEVICEREF|COMPONENTLIST|PARTSLIST|TB-?FEEDTHROUGH|SPARECIRCUIT)", t))
    schematic = bool(re.search(r"(SCHEMATIC|WIRINGDIAGRAM|SINGLELINE|SLD|CIRCUITDIAGRAM)", t)) and not rear
    term_diag = bool(re.search(r"(TERMINALDIAGRAM|TERMINALSCHEDULE|CONNECTIONTABLE|WIRELIST)", t)) and not internal
    if front and internal:
        return "INTERNAL_VIEW"
    if front and rear_plan:
        return "REAR_WIRING_VIEW"
    if rear_plan and not front:
        return "REAR_WIRING_VIEW"
    if internal and not front:
        return "INTERNAL_VIEW"
    if rear and front and re.search(r"(TERMINAL|WIRING|STRIP)", t):
        return "REAR_WIRING_VIEW"
    if legend and not rear:
        return "LEGEND_OR_BOM"
    if schematic:
        return "SCHEMATIC"
    if term_diag:
        return "TERMINAL_DIAGRAM"
    if front:
        return "FRONT_VIEW"
    if re.search(r"INTERNAL", t) and re.search(r"(WIRING|TERMINAL)", t):
        return "INTERNAL_VIEW"
    return "UNKNOWN"


def classify_header_view(page_view: str, kind: str, nearby: str = "") -> str:
    if kind == "legend_or_table":
        return "LEGEND_OR_BOM"
    if kind == "title_block":
        return "TITLE_BLOCK"
    if kind == "drawing_note":
        return "NOTES"
    if kind == "equipment_label":
        return "EQUIPMENT_LAYOUT"
    if page_view in ("FRONT_VIEW", "LEGEND_OR_BOM", "EQUIPMENT_LAYOUT", "SCHEMATIC", "TERMINAL_DIAGRAM"):
        return page_view
    if kind == "strip_candidate":
        if page_view in ("REAR_WIRING_VIEW", "INTERNAL_VIEW", "PHYSICAL_TB_BANK"):
            return "PHYSICAL_TB_BANK"
        near = normalize_header(nearby)
        if re.search(r"(TERMINAL|STRIP|WIRING|REAR|INTERNAL)", near):
            return "PHYSICAL_TB_BANK"
        return "UNKNOWN"
    return page_view or "UNKNOWN"


ELIGIBLE = {"REAR_WIRING_VIEW", "INTERNAL_VIEW", "PHYSICAL_TB_BANK"}
REJECTED = {
    "FRONT_VIEW", "EQUIPMENT_LAYOUT", "TERMINAL_DIAGRAM", "SCHEMATIC",
    "LEGEND_OR_BOM", "TITLE_BLOCK", "NOTES",
}


def is_physical_strip(kind: str) -> bool:
    return kind == "strip_candidate"


def score_candidate(
    *,
    header_exact: bool,
    terminal_range_found: bool,
    strong_cell_pattern: bool,
    unique: bool,
    ocr_only_weak: bool,
    peers: int,
    eligible_view: bool = False,
    has_real_box: bool = False,
) -> tuple[str, float, list[str]]:
    reasons: list[str] = []
    score = 0.0
    if header_exact:
        score += 0.4
        reasons.append("Expected header exact match")
    if terminal_range_found:
        score += 0.25
        reasons.append("Terminal range detected")
    if strong_cell_pattern:
        score += 0.2
        reasons.append("Repeated terminal-cell pattern")
    if unique:
        score += 0.15
        reasons.append("Unique candidate after disambiguation")
    if eligible_view:
        score += 0.15
        reasons.append("Eligible Internal/Rear/Physical TB view")
    if ocr_only_weak:
        score -= 0.2
        reasons.append("Weak OCR-only signal")
    if peers > 0:
        reasons.append(f"Conflicting peers={peers}")
        return "AMBIGUOUS", max(0.0, score - 0.3), reasons
    evidence = terminal_range_found or strong_cell_pattern or (eligible_view and has_real_box)
    if header_exact and evidence and unique and has_real_box:
        return "HIGH", min(1.0, max(score, 0.85)), reasons
    if header_exact and score >= 0.45:
        return "MEDIUM", score, reasons
    return "LOW", max(0.0, score), reasons


def find_terminal_range(text: str, header: str) -> tuple[str, bool]:
    esc = re.escape(header)
    m = re.search(
        rf"{esc}.{{0,200}}?(\d{{1,3}})\s*[-–—to]{{1,3}}\s*(\d{{1,3}})",
        text,
        re.I | re.S,
    )
    if not m:
        return "", False
    a, b = int(m.group(1)), int(m.group(2))
    if b < a or b - a > 200:
        return "", False
    return f"{a}-{b}", True


def header_token_present(compact: str, header: str) -> list[int]:
    h = normalize_header(header)
    if not h or not compact:
        return []
    out: list[int] = []
    start = 0
    while True:
        idx = compact.find(h, start)
        if idx < 0:
            break
        prev = compact[idx - 1] if idx > 0 else ""
        rest = compact[idx + len(h) :]
        ok = True
        if prev.isdigit():
            ok = False
        if ok and rest and rest[0].isdigit():
            ok = bool(re.match(r":\d{1,3}([-–—TO]{1,3}\d{1,3})?", rest))
        if ok and rest and rest[0].isalpha():
            ok = bool(re.match(r"^(TB|TYPE|FEEDTHROUGH|KNIFE|DISCONNECT)", rest))
        if ok:
            out.append(idx)
        start = idx + 1
    return out


def ocr_confusion_variants(header: str) -> set[str]:
    h = normalize_header(header)
    return {
        h,
        h.replace("0", "O"), h.replace("O", "0"),
        h.replace("1", "I"), h.replace("I", "1"),
        h.replace("5", "S"), h.replace("S", "5"),
        h.replace("8", "B"), h.replace("B", "8"),
    }


def detect_strip_shape(
    page_png_bytes: bytes,
    header_box: dict[str, float] | None,
) -> tuple[bool, dict[str, float] | None, list[str]]:
    """Max-accuracy path: OpenCV always attempted. Legacy DWES_TB_SHAPE=0 still skips."""
    if os.environ.get("DWES_TB_SHAPE") == "0":
        return False, None, ["opencv_disabled_by_env"]
    try:
        from opencv_strip import detect_strip_around_header

        r = detect_strip_around_header(page_png_bytes, header_box)
        return bool(r.get("physical_strip_detected")), r.get("strip_bbox"), list(r.get("notes") or [])
    except Exception as exc:  # noqa: BLE001
        return False, None, [f"opencv_error:{exc}"]


def deskew_pil(img: Any) -> tuple[Any, float]:
    """Soft deskew via OpenCV; returns (image, angle_deg)."""
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
        from PIL import Image
    except Exception:
        return img, 0.0
    try:
        arr = np.array(img.convert("L"))
        thr = cv2.threshold(arr, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
        coords = np.column_stack(np.where(thr > 0))
        if coords.shape[0] < 100:
            return img, 0.0
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        if abs(angle) < 0.3 or abs(angle) > 15:
            return img, 0.0
        (h, w) = arr.shape[:2]
        M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        rotated = cv2.warpAffine(arr, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        return Image.fromarray(rotated), float(angle)
    except Exception:
        return img, 0.0


def preprocess_pil(img: Any, enrichment: bool) -> Any:
    from PIL import ImageOps, ImageFilter, ImageEnhance, Image
    img = ImageOps.grayscale(img)
    img, _ = deskew_pil(img)
    img = ImageOps.autocontrast(img)
    # Mild denoise / CAD hatch reduction
    img = img.filter(ImageFilter.MedianFilter(size=3))
    if enrichment:
        img = img.filter(ImageFilter.SHARPEN)
        img = ImageEnhance.Contrast(img).enhance(1.4)
    return img


def ocr_image_words(img: Any, rotation_deg: float) -> tuple[list[dict[str, Any]], str, bytes]:
    import io
    import pytesseract
    from PIL import Image
    cfg = (
        "-c tessedit_char_whitelist="
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789=+-/()_.: "
    )
    data = pytesseract.image_to_data(img, config=cfg, output_type=pytesseract.Output.DICT)
    pw, ph = img.size
    words: list[dict[str, Any]] = []
    texts: list[str] = []
    n = len(data.get("text") or [])
    for i in range(n):
        raw = str(data["text"][i] or "").strip()
        if not raw:
            continue
        conf = int(float(data["conf"][i])) if str(data["conf"][i]).lstrip("-").isdigit() else -1
        if conf >= 0 and conf < 25:
            continue
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        words.append({
            "text": raw,
            "x": x / pw, "y": y / ph,
            "width": w / pw, "height": h / ph,
            "rotation": float(rotation_deg),
        })
        texts.append(raw)
    text = " ".join(texts)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return words, text, buf.getvalue()


def ocr_pages_with_boxes(path: str, dpi: int, enrichment: bool) -> list[dict[str, Any]]:
    try:
        import fitz
    except Exception:
        return []
    try:
        import pytesseract  # noqa: F401
        from PIL import Image
        import io
    except Exception:
        return []

    pages: list[dict[str, Any]] = []
    lower = path.lower()
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    angles = [0, 90, 180, 270] if enrichment else [0, 90, 180, 270]

    def process_base(img: Image.Image, page_number: int) -> dict[str, Any]:
        base = preprocess_pil(img, enrichment)
        # OSD angle hint
        osd_angle = 0
        try:
            import pytesseract
            osd = pytesseract.image_to_osd(base)
            m = re.search(r"Rotate: (\d+)", osd or "")
            if m:
                osd_angle = int(m.group(1)) % 360
        except Exception:
            pass
        all_words: list[dict[str, Any]] = []
        texts: list[str] = []
        png_bytes = b""
        rot_set = list(dict.fromkeys([0, osd_angle] + angles))
        for ang in rot_set:
            work = base if ang == 0 else base.rotate(ang, expand=True)
            words, text, png = ocr_image_words(work, float(ang))
            if ang == 0 or osd_angle == ang:
                png_bytes = png
            all_words.extend(words)
            if text:
                texts.append(text)
        joined = " ".join(texts)
        return {
            "page": page_number,
            "text": joined,
            "compact": normalize_header(joined),
            "words": all_words,
            "png": png_bytes or b"",
            "page_view": classify_page_view(joined),
        }

    if lower.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")):
        img = Image.open(path)
        pages.append(process_base(img, 1))
        return pages

    doc = fitz.open(path)
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        pages.append(process_base(img, i + 1))
    doc.close()
    return pages


def find_header_boxes_on_page(page: dict[str, Any], header: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    variants = ocr_confusion_variants(header)
    words = page.get("words") or []
    page_view = page.get("page_view") or classify_page_view(page.get("compact") or "")

    for i, word in enumerate(words):
        wt = normalize_header(word.get("text") or "")
        combo = ""
        use_next = False
        if wt not in variants:
            if i + 1 < len(words):
                combo = normalize_header(wt + normalize_header(words[i + 1].get("text") or ""))
                if combo not in variants:
                    continue
                use_next = True
            else:
                continue
        nearby_words = words[i + (2 if use_next else 1) : i + (2 if use_next else 1) + 8]
        nearby = " ".join(str(w.get("text") or "") for w in nearby_words)
        kind = classify_neighborhood(nearby)
        view = classify_header_view(page_view, kind, nearby)
        w_box = float(word["width"]) + (float(words[i + 1]["width"]) if use_next else 0.0)
        h_box = max(float(word["height"]), float(words[i + 1]["height"]) if use_next else float(word["height"]))
        hits.append({
            "kind": kind,
            "view": view,
            "nearby": nearby,
            "geometry": {
                "x": float(word["x"]),
                "y": float(word["y"]),
                "width": w_box,
                "height": h_box,
                "rotation": float(word.get("rotation") or 0.0),
                "region_kind": kind,
                "nearby_compact": normalize_header(nearby),
                "page_compact": page.get("compact") or "",
                "view_classification": view,
            },
            "confused": wt != normalize_header(header) and combo != normalize_header(header),
        })
    return hits


def classify_document_type(path: str, pages: list[dict[str, Any]]) -> list[str]:
    lower = path.lower()
    if lower.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")):
        return ["IMAGE"] * max(1, len(pages))
    # Heuristic: sparse OCR words → likely outlined CAD; dense → flattened/scanned
    types: list[str] = []
    for p in pages:
        n = len(p.get("words") or [])
        if n < 20:
            types.append("VECTOR_PDF_WITH_OUTLINED_TEXT")
        elif n < 80:
            types.append("FLATTENED_PDF")
        else:
            types.append("SCANNED_PDF")
    return types or ["FLATTENED_PDF"]


def analyse(payload: dict[str, Any]) -> dict[str, Any]:
    path = payload.get("drawing_path") or ""
    expected = [normalize_header(h) for h in (payload.get("expected_headers") or [])]
    schedule_map = payload.get("schedule_terminals_by_header") or {}
    enrichment = bool(payload.get("enrichment"))
    dpi = int(payload.get("dpi") or (400 if enrichment else 350))
    notes: list[str] = []
    candidates: list[dict[str, Any]] = []
    headers_found: list[str] = []
    headers_missing: list[str] = []
    legend_only: list[str] = []
    unresolved: list[str] = []

    if not path or not os.path.isfile(path):
        return {
            "page_types": ["UNSUPPORTED"],
            "candidates": [],
            "engine": "python-cli",
            "notes": ["drawing_missing"],
            "headers_found": [],
            "headers_missing": expected,
            "headers_legend_only": [],
            "headers_unresolved": [],
        }

    notes.append(f"ocr_dpi={dpi}")
    pages = ocr_pages_with_boxes(path, dpi, enrichment)
    page_types = classify_document_type(path, pages)
    if not pages:
        notes.append("ocr_unavailable_or_empty")
        return {
            "page_types": page_types or ["FLATTENED_PDF"],
            "candidates": [],
            "engine": "python-cli",
            "notes": notes + ["ocr_stage_failed"],
            "headers_found": [],
            "headers_missing": expected,
            "headers_legend_only": [],
            "headers_unresolved": [],
        }

    notes.append("ocr_pages=" + str(len(pages)))
    if os.environ.get("DWES_TB_ADVANCED_AI") == "1":
        notes.append("advanced_ai_stub_enabled")

    for header in expected:
        page_for_hit: list[tuple[dict[str, Any], dict[str, Any]]] = []
        for page in pages:
            for hit in find_header_boxes_on_page(page, header):
                page_for_hit.append((page, hit))
        if not page_for_hit:
            headers_missing.append(header)
            continue

        strip_pairs = [(p, h) for p, h in page_for_hit if is_physical_strip(h["kind"])]
        if not strip_pairs:
            legend_only.append(header)
            headers_missing.append(header)
            kinds = sorted({h["kind"] for _, h in page_for_hit})
            notes.append(f"non_physical_only:{header}:{','.join(kinds)}")
            continue

        # Prefer eligible-view strip hits
        eligible_pairs = [(p, h) for p, h in strip_pairs if h.get("view") in ELIGIBLE]
        use_pairs = eligible_pairs or strip_pairs
        peers = len(use_pairs) - 1
        page, hit = use_pairs[0]
        geom = dict(hit["geometry"])
        has_box = geom["width"] > 0.002 and geom["height"] > 0.002
        term, found = find_terminal_range(page.get("text") or "", header)
        view = hit.get("view") or "UNKNOWN"
        eligible = view in ELIGIBLE

        strong_cells = False
        if has_box:
            strong_cells, shape_geom, shape_notes = detect_strip_shape(page.get("png") or b"", geom)
            notes.extend(shape_notes)
            if shape_geom:
                shape_geom["rotation"] = geom.get("rotation", 0.0)
                geom = shape_geom

        conf, score, reasons = score_candidate(
            header_exact=True,
            terminal_range_found=found,
            strong_cell_pattern=strong_cells,
            unique=(peers == 0),
            ocr_only_weak=(not found and not strong_cells and not eligible),
            peers=peers,
            eligible_view=eligible,
            has_real_box=has_box,
        )
        reasons.append(f"view={view}")

        if view in REJECTED:
            conf, score = "LOW", min(score, 0.3)
            reasons.append(f"Rejected view {view}")
        elif not eligible and conf == "HIGH":
            conf, score = "MEDIUM", min(score, 0.7)
            reasons.append(f"View {view} not eligible for HIGH")

        sched_terms = schedule_map.get(header) or schedule_map.get(normalize_header(header)) or []
        if found and sched_terms:
            try:
                a, b = [int(x) for x in term.split("-", 1)]
                in_range = []
                for t in sched_terms:
                    m = re.search(r"(\d{1,3})", str(t))
                    if m and a <= int(m.group(1)) <= b:
                        in_range.append(t)
                if in_range:
                    reasons.append(f"Schedule terminals in strip range: {','.join(map(str, in_range))}")
            except Exception:
                pass

        if not has_box:
            conf, score = "MEDIUM", min(score, 0.55)
            reasons.append("OCR hit lacks real bounding box — capped at MEDIUM")
        if conf == "HIGH" and (not has_box or geom["width"] <= 0.002):
            conf, score = "MEDIUM", min(score, 0.7)
            reasons.append("HIGH requires real glyph/shape boxes — placeholder capped at MEDIUM")

        if conf == "LOW":
            unresolved.append(header)
            headers_missing.append(header)
            notes.append(f"unresolved:{header}:{('|'.join(reasons))}")
            continue

        headers_found.append(header)
        if conf in ("MEDIUM", "AMBIGUOUS"):
            unresolved.append(header)

        if has_box and conf != "LOW":
            candidates.append({
                "tb_number": header,
                "terminal_group": term if found else "UNVERIFIED",
                "page_number": int(page.get("page") or 1),
                "view_name": view,
                "page_compact": page.get("compact") or "",
                "geometry": geom,
                "detection_method": "OCR_AND_SHAPE" if strong_cells else "OCR",
                "confidence": conf,
                "confidence_score": score,
                "reasons": reasons,
            })

    if enrichment:
        notes.append("enrichment_pass_ocr")
    if not headers_found and expected:
        notes.append("schedule_drawing_mismatch_no_physical_tb_headers_in_drawing")

    result = {
        "page_types": page_types if page_types else ["FLATTENED_PDF"],
        "candidates": candidates,
        "engine": "python-cli-ocr",
        "notes": notes,
        "headers_found": headers_found,
        "headers_missing": headers_missing,
        "headers_legend_only": legend_only,
        "headers_unresolved": unresolved,
    }
    # Maximum-accuracy package: tiles + LocateAnything + evidence objects (mandatory participation).
    try:
        from evidence_pipeline import attach_max_accuracy_package

        result = attach_max_accuracy_package(
            result,
            pages=pages,
            expected=expected,
            schedule_map={normalize_header(k): v for k, v in (schedule_map or {}).items()},
            dpi=dpi,
        )
    except Exception as exc:  # noqa: BLE001
        result["notes"] = list(result.get("notes") or []) + [f"max_accuracy_package_error:{exc}"]
        result["grounding_unavailable"] = True
        result["locate_status"] = "LOCATE_UNAVAILABLE"
    return result


def main() -> None:
    raw = sys.stdin.read()
    payload = json.loads(raw or "{}")
    result = analyse(payload)
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()