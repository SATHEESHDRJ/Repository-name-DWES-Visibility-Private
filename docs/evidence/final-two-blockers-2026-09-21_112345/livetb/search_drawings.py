#!/usr/bin/env python3
"""Exhaustive PDF text/view inventory for LIVE TB acceptance search. Read-only."""
import json
import re
from pathlib import Path

try:
    import fitz
    HAS_FITZ = True
except Exception:
    HAS_FITZ = False


def pdf_text_pages(path: str):
    pages = []
    if not HAS_FITZ:
        return [{"page": 0, "chars": 0, "text": "", "error": "no fitz"}]
    doc = fitz.open(path)
    for i, page in enumerate(doc):
        t = page.get_text("text") or ""
        pages.append({"page": i + 1, "chars": len(t), "text": t})
    doc.close()
    return pages


DRAWINGS = {
    "H00_backup_latest": Path(
        "/app/uploads/backups/DRAWING_REPLACE_33kV_BUSBAR_PROTECTION_PANEL___H00_R_.pd_2026-07-21T12-35-32/"
        "drw_cced3212-3e5d-4512-a5e8-01c8951914dc_33kV BUSBAR PROTECTION PANEL (_H00+R).pdf"
    ),
    "H00_backup_oldest": Path(
        "/app/uploads/backups/DRAWING_REPLACE_33kV_BUSBAR_PROTECTION_PANEL___H00_R_.pd_2026-07-21T05-39-28/"
        "drw_cbd71b92-890a-4b6d-a0f5-ddde0ca2445d_33kV BUSBAR PROTECTION PANEL (_H00+R).pdf"
    ),
    "E01_R1": Path("/app/uploads/001/drawings/drw_73b1fd8e-be16-448f-b46c-593dee54b0ef_E01_R1.pdf"),
    "SIET4_GA": Path(
        "/app/uploads/003/drawings/drw_b2c17e4b-8605-465a-8480-fe3750cc5e72_SIET-4 SOLAR WADI PV FEEDER-1_GA.pdf"
    ),
}

KEYWORDS = [
    "INTERNAL",
    "REAR",
    "FRONT",
    "PHYSICAL",
    "LEGEND",
    "DIRECTORY",
    "TERMINAL",
    "ARRANGEMENT",
    "WIRING",
    "DIN",
]

results = {"has_fitz": HAS_FITZ, "drawings": {}}
for label, p in DRAWINGS.items():
    if not p.exists():
        results["drawings"][label] = {"missing": True, "path": str(p)}
        continue
    pages = pdf_text_pages(str(p))
    summary = []
    for pg in pages:
        t = pg["text"]
        upper = t.upper()
        view_hits = [kw for kw in KEYWORDS if kw in upper]
        tokens = sorted(set(re.findall(r"\b[A-Z]{1,4}\d{1,4}[A-Z]?\b", t)))[:60]
        # flag legend-context pages
        legendish = bool(re.search(r"\bLEGEND\b|\bDIRECTORY\b|\bREF\.?\s*TABLE\b", upper))
        eligible_view = any(k in upper for k in ("INTERNAL", "REAR", "PHYSICAL"))
        front_only = ("FRONT" in upper) and not eligible_view
        summary.append(
            {
                "page": pg["page"],
                "chars": pg["chars"],
                "view_keywords": view_hits,
                "legend_or_directory": legendish,
                "eligible_view_keywords_present": eligible_view,
                "front_without_eligible": front_only,
                "sample_device_tokens": tokens,
                "preview": t[:500].replace("\n", " | "),
            }
        )
    results["drawings"][label] = {
        "path": str(p),
        "bytes": p.stat().st_size,
        "page_count": len(pages),
        "total_text_chars": sum(x["chars"] for x in pages),
        "scanned_or_empty_text": sum(x["chars"] for x in pages) < 50,
        "pages": summary,
    }

out_path = Path("/tmp/livetb_drawing_search.json")
out_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps({"wrote": str(out_path), "summary": {
    k: {
        "pages": v.get("page_count"),
        "chars": v.get("total_text_chars"),
        "scanned": v.get("scanned_or_empty_text"),
        "eligible_pages": [
            p["page"] for p in v.get("pages", []) if p.get("eligible_view_keywords_present")
        ],
    }
    for k, v in results["drawings"].items()
}}, indent=2))
