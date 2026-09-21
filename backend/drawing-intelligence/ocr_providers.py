# -*- coding: utf-8 -*-
"""OCR provider abstraction — Tesseract (required) + PaddleOCR (optional ensemble)."""
from __future__ import annotations

import os
import re
from typing import Any, Protocol


def normalize_header(value: str) -> str:
    return re.sub(r"\s+", "", (value or "").strip()).upper()


def ocr_confusion_variants(header: str) -> set[str]:
    h = normalize_header(header)
    return {
        h,
        h.replace("0", "O"), h.replace("O", "0"),
        h.replace("1", "I"), h.replace("I", "1"),
        h.replace("5", "S"), h.replace("S", "5"),
        h.replace("8", "B"), h.replace("B", "8"),
    }


def constrained_normalize(raw: str, expected_headers: list[str]) -> dict[str, Any]:
    """
    Do NOT globally autocorrect. Only map OCR → expected when a constrained
    confusion variant matches an expected header.
    """
    raw_n = normalize_header(raw)
    if not raw_n:
        return {
            "raw_ocr": raw,
            "normalized_candidate": "",
            "normalization_reason": "empty",
        }
    expected = {normalize_header(h) for h in expected_headers if h}
    if raw_n in expected:
        return {
            "raw_ocr": raw,
            "normalized_candidate": raw_n,
            "normalization_reason": "exact",
        }
    for exp in expected:
        if raw_n in ocr_confusion_variants(exp) or exp in ocr_confusion_variants(raw_n):
            return {
                "raw_ocr": raw,
                "normalized_candidate": exp,
                "normalization_reason": "constrained_confusion_vs_expected",
            }
    return {
        "raw_ocr": raw,
        "normalized_candidate": raw_n,
        "normalization_reason": "no_expected_match",
    }


class OcrProvider(Protocol):
    name: str

    def available(self) -> bool: ...

    def extract_words(self, img: Any, rotation_deg: float = 0.0) -> list[dict[str, Any]]: ...


class TesseractOcrProvider:
    name = "tesseract"

    def available(self) -> bool:
        try:
            import pytesseract
            from PIL import Image

            pytesseract.image_to_string(Image.new("L", (16, 16), 255))
            return True
        except Exception:
            return False

    def extract_words(self, img: Any, rotation_deg: float = 0.0) -> list[dict[str, Any]]:
        import pytesseract

        cfg = (
            "-c tessedit_char_whitelist="
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789=+-/()_.: "
        )
        data = pytesseract.image_to_data(img, config=cfg, output_type=pytesseract.Output.DICT)
        pw, ph = img.size
        words: list[dict[str, Any]] = []
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
                "x": x / pw,
                "y": y / ph,
                "width": w / pw,
                "height": h / ph,
                "rotation": float(rotation_deg),
                "engine": self.name,
                "engine_confidence": conf,
            })
        return words


class PaddleOcrProvider:
    name = "paddleocr"

    def __init__(self) -> None:
        self._ocr = None
        self._init_error = ""

    def available(self) -> bool:
        providers = (os.environ.get("DWES_OCR_PROVIDERS") or "tesseract").lower()
        if "paddle" not in providers:
            return False
        try:
            from paddleocr import PaddleOCR  # type: ignore

            if self._ocr is None:
                self._ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
            return True
        except Exception as exc:  # noqa: BLE001
            self._init_error = str(exc)
            return False

    def extract_words(self, img: Any, rotation_deg: float = 0.0) -> list[dict[str, Any]]:
        if not self.available() or self._ocr is None:
            return []
        import numpy as np

        arr = np.array(img.convert("RGB"))
        result = self._ocr.ocr(arr, cls=True)
        pw, ph = img.size
        words: list[dict[str, Any]] = []
        for block in result or []:
            for line in block or []:
                box, (text, score) = line[0], line[1]
                if not text:
                    continue
                xs = [p[0] for p in box]
                ys = [p[1] for p in box]
                x0, x1 = min(xs), max(xs)
                y0, y1 = min(ys), max(ys)
                words.append({
                    "text": str(text),
                    "x": x0 / pw,
                    "y": y0 / ph,
                    "width": max(0.001, (x1 - x0) / pw),
                    "height": max(0.001, (y1 - y0) / ph),
                    "rotation": float(rotation_deg),
                    "engine": self.name,
                    "engine_confidence": float(score) * 100.0,
                })
        return words


def enabled_providers() -> list[OcrProvider]:
    out: list[OcrProvider] = []
    tess = TesseractOcrProvider()
    if tess.available():
        out.append(tess)
    paddle = PaddleOcrProvider()
    if paddle.available():
        out.append(paddle)
    return out


def consensus_words(
    provider_word_lists: list[list[dict[str, Any]]],
    expected_headers: list[str],
) -> list[dict[str, Any]]:
    """Merge provider outputs; attach constrained normalization metadata."""
    merged: list[dict[str, Any]] = []
    for words in provider_word_lists:
        for w in words:
            norm = constrained_normalize(str(w.get("text") or ""), expected_headers)
            item = dict(w)
            item.update(norm)
            merged.append(item)
    return merged
