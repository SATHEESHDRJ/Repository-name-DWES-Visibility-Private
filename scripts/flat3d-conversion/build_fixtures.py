"""Build representative DXF/PDF fixtures for the flat3d pipeline tests.

Run:
    cd scripts/flat3d-conversion
    python build_fixtures.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import ezdxf
except ImportError:
    sys.exit("ezdxf is required. Run: pip install -r requirements.txt")

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
UTF8 = "utf-8"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _wj(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding=UTF8)


def _meta(path: Path, desc: str, **kw) -> None:
    _wj(path, {"description": desc, **kw})


def _new_doc(insunits: int = 4):
    """Return (doc, msp) with INSUNITS set."""
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = insunits
    return doc, doc.modelspace()


def _closed_rect(space, x0: float, y0: float, x1: float, y1: float, layer: str = "0"):
    lwp = space.add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
    lwp.closed = True
    lwp.dxf.layer = layer
    return lwp


def _device_block(doc, name: str, w: float = 80.0, h: float = 80.0):
    """Create a named block with a body LWPOLYLINE and TAG ATTDEF."""
    blk = doc.blocks.new(name)
    body = blk.add_lwpolyline([(0.0, 0.0), (w, 0.0), (w, h), (0.0, h)])
    body.closed = True
    body.dxf.layer = "DEVICE"
    # ezdxf 1.x: add_attdef(tag, insert, text="", dxfattribs=None)
    blk.add_attdef("TAG", (0.0, -10.0), text="", dxfattribs={"height": 5.0})
    return blk


def _insert_tagged(msp, block_name: str, x: float, y: float, tag_val: str,
                   layer: str = "DEVICE", rotation: float = 0.0):
    """Insert a block reference with a TAG ATTRIB carrying the engineering tag value."""
    ins = msp.add_blockref(block_name, (x, y),
                           dxfattribs={"layer": layer, "rotation": rotation})
    ins.add_attrib("TAG", tag_val, (x, y - 10.0), dxfattribs={"height": 5.0, "layer": layer})
    return ins


# ---------------------------------------------------------------------------
# Individual fixture builders
# ---------------------------------------------------------------------------

def build_clean_named_blocks(base: Path) -> None:
    """Panel envelope + MCB/CONTACTOR with ATTDEFs; two schedule-matched inserts; mm."""
    doc, msp = _new_doc(4)
    _closed_rect(msp, 0.0, 0.0, 800.0, 600.0, "PANEL")
    _device_block(doc, "MCB", 80.0, 80.0)
    _device_block(doc, "CONTACTOR", 120.0, 100.0)
    _insert_tagged(msp, "MCB", 100.0, 150.0, "=Q1+F1")
    _insert_tagged(msp, "CONTACTOR", 300.0, 300.0, "=Q2+K1")

    doc.saveas(str(base / "drawing.dxf"))
    _wj(base / "schedule.json", {"tags": ["=Q1+F1", "=Q2+K1"]})
    _meta(base / "meta.json",
          "Clean named blocks: panel 800x600mm, MCB+CONTACTOR with ATTDEFs, schedule-matched, INSUNITS=4",
          insunits=4, expected_status="READY_FOR_REVIEW")


def build_exploded_lines(base: Path) -> None:
    """No INSERT blocks; closed rect outlines + nearby TEXT approximate devices."""
    doc, msp = _new_doc(4)
    _closed_rect(msp, 0.0, 0.0, 600.0, 400.0, "PANEL")
    _closed_rect(msp, 50.0, 50.0, 130.0, 130.0, "DEVICE")
    msp.add_text("=Q1+F1", dxfattribs={"insert": (50.0, 38.0), "height": 8.0, "layer": "DEVICE"})
    _closed_rect(msp, 200.0, 100.0, 300.0, 200.0, "DEVICE")
    msp.add_text("=Q2+K1", dxfattribs={"insert": (200.0, 88.0), "height": 8.0, "layer": "DEVICE"})

    doc.saveas(str(base / "drawing.dxf"))
    _wj(base / "schedule.json", {"tags": ["=Q1+F1", "=Q2+K1"]})
    _meta(base / "meta.json",
          "Exploded lines: no INSERTs, rect outlines + TEXT tags approximate devices",
          insunits=4, expected_status="READY_FOR_REVIEW")


def build_nested_blocks(base: Path) -> None:
    """Outer block containing inner device block INSERT."""
    doc, msp = _new_doc(4)
    _closed_rect(msp, 0.0, 0.0, 700.0, 500.0, "PANEL")

    inner = doc.blocks.new("INNER_DEVICE")
    ib = inner.add_lwpolyline([(0.0, 0.0), (60.0, 0.0), (60.0, 60.0), (0.0, 60.0)])
    ib.closed = True
    ib.dxf.layer = "DEVICE"
    inner.add_attdef("TAG", (0.0, -8.0), text="", dxfattribs={"height": 5.0})

    outer = doc.blocks.new("OUTER_DEVICE")
    ob = outer.add_lwpolyline([(0.0, 0.0), (80.0, 0.0), (80.0, 80.0), (0.0, 80.0)])
    ob.closed = True
    ob.dxf.layer = "DEVICE"
    outer.add_blockref("INNER_DEVICE", (10.0, 10.0))
    outer.add_attdef("TAG", (0.0, -10.0), text="", dxfattribs={"height": 5.0})

    ins = msp.add_blockref("OUTER_DEVICE", (200.0, 200.0), dxfattribs={"layer": "DEVICE"})
    ins.add_attrib("TAG", "=Q1+N1", (200.0, 188.0), dxfattribs={"height": 5.0})

    doc.saveas(str(base / "drawing.dxf"))
    _wj(base / "schedule.json", {"tags": ["=Q1+N1"]})
    _meta(base / "meta.json",
          "Nested blocks: OUTER_DEVICE block contains INSERT of INNER_DEVICE block",
          insunits=4, expected_status="READY_FOR_REVIEW")


def build_rotated_devices(base: Path) -> None:
    """INSERT with rotation=90 degrees."""
    doc, msp = _new_doc(4)
    _closed_rect(msp, 0.0, 0.0, 500.0, 400.0, "PANEL")
    _device_block(doc, "MCB", 80.0, 80.0)
    _insert_tagged(msp, "MCB", 200.0, 200.0, "=Q1+R1", rotation=90.0)

    doc.saveas(str(base / "drawing.dxf"))
    _wj(base / "schedule.json", {"tags": ["=Q1+R1"]})
    _meta(base / "meta.json",
          "Rotated devices: INSERT rotation=90 degrees",
          insunits=4, rotation_deg=90, expected_status="READY_FOR_REVIEW")


def build_duplicate_tags(base: Path) -> None:
    """Two INSERTs sharing TAG =Q1+F1; schedule_match.duplicate_tags must be non-empty."""
    doc, msp = _new_doc(4)
    _closed_rect(msp, 0.0, 0.0, 600.0, 400.0, "PANEL")
    _device_block(doc, "MCB", 80.0, 80.0)
    _insert_tagged(msp, "MCB", 100.0, 100.0, "=Q1+F1")
    _insert_tagged(msp, "MCB", 300.0, 100.0, "=Q1+F1")

    doc.saveas(str(base / "drawing.dxf"))
    _wj(base / "schedule.json", {"tags": ["=Q1+F1"]})
    _meta(base / "meta.json",
          "Duplicate tags: two INSERTs have TAG =Q1+F1",
          expected_duplicate_tag="=Q1+F1")


def build_units_mm(base: Path) -> None:
    """INSUNITS=4 (mm) — same geometry as clean_named_blocks, explicit mm verification."""
    doc, msp = _new_doc(4)
    _closed_rect(msp, 0.0, 0.0, 600.0, 400.0, "PANEL")
    _device_block(doc, "MCB", 80.0, 80.0)
    _insert_tagged(msp, "MCB", 100.0, 150.0, "=Q1+F1")

    doc.saveas(str(base / "drawing.dxf"))
    _wj(base / "schedule.json", {"tags": ["=Q1+F1"]})
    _meta(base / "meta.json",
          "Units mm: INSUNITS=4, geometry in mm",
          insunits=4, expected_status="READY_FOR_REVIEW")


def build_units_inches(base: Path) -> None:
    """INSUNITS=1 (inches); 40x30 inch panel becomes 1016x762 mm after conversion."""
    doc, msp = _new_doc(1)
    _closed_rect(msp, 0.0, 0.0, 40.0, 30.0, "PANEL")
    blk = doc.blocks.new("MCB")
    bb = blk.add_lwpolyline([(0.0, 0.0), (3.0, 0.0), (3.0, 3.0), (0.0, 3.0)])
    bb.closed = True
    bb.dxf.layer = "DEVICE"
    blk.add_attdef("TAG", (0.0, -0.5), text="", dxfattribs={"height": 0.2})
    ins = msp.add_blockref("MCB", (10.0, 10.0), dxfattribs={"layer": "DEVICE"})
    ins.add_attrib("TAG", "=Q1+F1", (10.0, 9.5), dxfattribs={"height": 0.2})

    doc.saveas(str(base / "drawing.dxf"))
    _wj(base / "schedule.json", {"tags": ["=Q1+F1"]})
    _meta(base / "meta.json",
          "Units inches: INSUNITS=1, 40x30in panel -> 1016x762mm after conversion",
          insunits=1, expected_unit="inches",
          expected_extents_mm={"width": 1016.0, "height": 762.0})


def build_vector_pdf(base: Path) -> None:
    """Minimal PDF with BT (vector) Tj ET stream — pipeline returns APPROVED_2D_ONLY."""
    cs = b"BT /F1 12 Tf 100 700 Td (vector) Tj ET"
    body = (
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R>>endobj\n"
        b"4 0 obj<</Length " + str(len(cs)).encode() + b">>\nstream\n" + cs + b"\nendstream\nendobj\n"
    )
    xoff = len(b"%PDF-1.4\n") + len(body)
    pdf = (
        b"%PDF-1.4\n" + body
        + b"xref\n0 5\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000200 00000 n \n"
        b"trailer<</Size 5/Root 1 0 R>>\n"
        b"startxref\n" + str(xoff).encode() + b"\n%%EOF\n"
    )
    (base / "drawing.pdf").write_bytes(pdf)
    _wj(base / "schedule.json", {"tags": []})
    _meta(base / "meta.json",
          "Vector PDF: BT (vector) Tj ET text stream; pipeline returns APPROVED_2D_ONLY",
          expected_fallback="APPROVED_2D_ONLY")


def build_scanned_pdf(base: Path) -> None:
    """Minimal PDF without geometry content — pipeline returns APPROVED_2D_ONLY."""
    pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n"
        b"xref\n0 4\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"trailer<</Size 4/Root 1 0 R>>\n"
        b"startxref\n178\n%%EOF\n"
    )
    (base / "drawing.pdf").write_bytes(pdf)
    _wj(base / "schedule.json", {"tags": []})
    _meta(base / "meta.json",
          "Scanned PDF: minimal PDF no geometry; pipeline returns APPROVED_2D_ONLY",
          expected_fallback="APPROVED_2D_ONLY")


def build_corrupted_dxf(base: Path) -> None:
    """Garbage bytes as drawing.dxf — ezdxf readfile fails; pipeline reports FAILED."""
    (base / "drawing.dxf").write_bytes(
        b"GARBAGE BYTES NOT A DXF FILE\x00\xff\x80\x12\x34\xde\xad\xbe\xef"
    )
    _wj(base / "schedule.json", {"tags": []})
    _meta(base / "meta.json",
          "Corrupted DXF: garbage bytes; expect DXF_PARSE failure",
          expected_status="FAILED", expected_stage="DXF_PARSE")


def build_empty_drawing(base: Path) -> None:
    """Valid DXF with zero modelspace entities/texts."""
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 4
    doc.saveas(str(base / "drawing.dxf"))
    _wj(base / "schedule.json", {"tags": []})
    _meta(base / "meta.json",
          "Empty drawing: valid DXF zero entities; pipeline fails DXF_PARSE or GEOMETRY_NORMALIZATION",
          expected_status="FAILED")


def build_large_panel(base: Path) -> None:
    """80 INSERT devices on 2000x1500mm panel."""
    doc, msp = _new_doc(4)
    _closed_rect(msp, 0.0, 0.0, 2000.0, 1500.0, "PANEL")
    _device_block(doc, "MCB", 80.0, 80.0)
    tags: list = []
    cols, rows = 8, 10
    for row in range(rows):
        for col in range(cols):
            idx = row * cols + col + 1
            tag = "=Q{:03d}+F1".format(idx)
            tags.append(tag)
            _insert_tagged(msp, "MCB", 100.0 + col * 220.0, 100.0 + row * 140.0, tag)

    doc.saveas(str(base / "drawing.dxf"))
    _wj(base / "schedule.json", {"tags": tags})
    _meta(base / "meta.json",
          "Large panel: {} INSERT devices on 2000x1500mm".format(len(tags)),
          insunits=4, device_count=len(tags), expected_status="READY_FOR_REVIEW")


def build_revision_mismatch(base: Path) -> None:
    """Drawing has =Q1+F1,=Q2+K1; schedule has =Q1+F1,=Q9+EXTRA — intentional mismatch."""
    doc, msp = _new_doc(4)
    _closed_rect(msp, 0.0, 0.0, 600.0, 400.0, "PANEL")
    _device_block(doc, "MCB", 80.0, 80.0)
    _device_block(doc, "CONTACTOR", 120.0, 100.0)
    _insert_tagged(msp, "MCB", 100.0, 150.0, "=Q1+F1")
    _insert_tagged(msp, "CONTACTOR", 300.0, 250.0, "=Q2+K1")

    doc.saveas(str(base / "drawing.dxf"))
    _wj(base / "schedule.json", {"tags": ["=Q1+F1", "=Q9+EXTRA"]})
    _meta(base / "meta.json",
          "Revision mismatch: drawing =Q1+F1,=Q2+K1 vs schedule =Q1+F1,=Q9+EXTRA",
          expected_unmatched_schedule=["=Q9+EXTRA"],
          expected_unmatched_drawing=["=Q2+K1"])


def build_corrupted_dwg(base: Path) -> None:
    """Fake .dwg binary stub; expects DWG_TO_DXF failure (no LibreDWG configured)."""
    (base / "drawing.dwg").write_bytes(b"AC1015" + b"\x00" * 10 + b"FAKE DWG STUB TEST")
    _wj(base / "schedule.json", {"tags": []})
    _meta(base / "meta.json",
          "Corrupted DWG: fake binary stub; expect DWG_TO_DXF failure",
          expected_status="FAILED", expected_stage="DWG_TO_DXF")


# ---------------------------------------------------------------------------
# Registry and main
# ---------------------------------------------------------------------------

BUILDERS: dict = {
    "clean_named_blocks": build_clean_named_blocks,
    "exploded_lines": build_exploded_lines,
    "nested_blocks": build_nested_blocks,
    "rotated_devices": build_rotated_devices,
    "duplicate_tags": build_duplicate_tags,
    "units_mm": build_units_mm,
    "units_inches": build_units_inches,
    "vector_pdf": build_vector_pdf,
    "scanned_pdf": build_scanned_pdf,
    "corrupted_dxf": build_corrupted_dxf,
    "empty_drawing": build_empty_drawing,
    "large_panel": build_large_panel,
    "revision_mismatch": build_revision_mismatch,
    "corrupted_dwg": build_corrupted_dwg,
}

_DRAW_EXT: dict = {
    "vector_pdf": ".pdf",
    "scanned_pdf": ".pdf",
    "corrupted_dwg": ".dwg",
}


def _done_marker(name: str) -> Path:
    return FIXTURES_DIR / name / ("drawing" + _DRAW_EXT.get(name, ".dxf"))


def build_all(force: bool = False) -> None:
    for name, builder in BUILDERS.items():
        marker = _done_marker(name)
        if not force and marker.exists():
            print("  [skip]  {}".format(name))
            continue
        d = FIXTURES_DIR / name
        d.mkdir(parents=True, exist_ok=True)
        print("  [build] {} ...".format(name), end=" ", flush=True)
        try:
            builder(d)
            print("ok")
        except Exception as exc:
            print("FAIL: {}".format(exc), file=sys.stderr)
            raise


def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(description="Build flat3d test fixtures")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args(argv)
    print("Building fixtures in: {}".format(FIXTURES_DIR))
    build_all(force=args.force)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())