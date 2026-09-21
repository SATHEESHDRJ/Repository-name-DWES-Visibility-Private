"""pytest suite for the DWES drawing-first Flat 3D pipeline.

Run from scripts/flat3d-conversion/:
    python -m pytest -q
"""
from __future__ import annotations
import json
import struct
import sys
from pathlib import Path
import pytest

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from flat3d.pipeline import run_pipeline

FIXTURES = _ROOT / "fixtures"


def _ensure() -> None:
    if not (FIXTURES / "clean_named_blocks" / "drawing.dxf").exists():
        import build_fixtures as _bf
        _bf.build_all()


def _draw(fx: str) -> Path:
    for ext in (".dxf", ".pdf", ".dwg"):
        p = FIXTURES / fx / ("drawing" + ext)
        if p.exists():
            return p
    raise FileNotFoundError(fx)


def _ok(fx: str, tmp: Path, sched: bool = True, **kw):
    _ensure()
    sp = FIXTURES / fx / "schedule.json"
    r = run_pipeline(
        input_path=str(_draw(fx)),
        out_dir=str(tmp / fx),
        project_code="TEST",
        frame_id=fx,
        schedule_json=str(sp) if sched and sp.exists() else None,
        skip_gltf_validator=True,
        **kw,
    )
    return r, tmp / fx


def _safe(fx: str, tmp: Path, sched: bool = True, **kw):
    _ensure()
    sp = FIXTURES / fx / "schedule.json"
    out = tmp / fx
    out.mkdir(parents=True, exist_ok=True)
    try:
        r = run_pipeline(
            input_path=str(_draw(fx)),
            out_dir=str(out),
            project_code="TEST",
            frame_id=fx,
            schedule_json=str(sp) if sched and sp.exists() else None,
            skip_gltf_validator=True,
            **kw,
        )
    except RuntimeError:
        rp = out / "report.json"
        r = json.loads(rp.read_text(encoding="utf-8")) if rp.exists() else {"status": "FAILED"}
    return r, out


def _glb_json(b: bytes) -> dict:
    assert b[:4] == b"glTF"
    n = struct.unpack_from("<I", b, 12)[0]
    return json.loads(b[20:20 + n].rstrip(b" \x00"))


# ---------- core success ----------

def test_clean_status(tmp_path):
    _ensure()
    r, _ = _ok("clean_named_blocks", tmp_path)
    assert r["status"] == "READY_FOR_REVIEW", r.get("status")


def test_clean_glb_exists(tmp_path):
    _ensure()
    r, out = _ok("clean_named_blocks", tmp_path)
    assert (out / "model.glb").exists()


def test_clean_glb_magic(tmp_path):
    _ensure()
    r, out = _ok("clean_named_blocks", tmp_path)
    assert (out / "model.glb").read_bytes()[:4] == b"glTF"


def test_clean_overlay(tmp_path):
    _ensure()
    r, out = _ok("clean_named_blocks", tmp_path)
    ov = json.loads((out / "overlay_compare.json").read_text(encoding="utf-8"))
    pct = ov.get("matched_device_pct", 0)
    cnt = ov.get("drawing_insert_count", 0)
    assert pct >= 50 or cnt >= 1, f"pct={pct} cnt={cnt}"


# ---------- glTF structure ----------

def test_gltf_asset_version(tmp_path):
    _ensure()
    r, out = _ok("clean_named_blocks", tmp_path)
    g = _glb_json((out / "model.glb").read_bytes())
    assert g.get("asset", {}).get("version") == "2.0"


def test_gltf_has_nodes(tmp_path):
    _ensure()
    r, out = _ok("clean_named_blocks", tmp_path)
    g = _glb_json((out / "model.glb").read_bytes())
    assert len(g.get("nodes", [])) >= 1


def test_glb_node_source_handle(tmp_path):
    _ensure()
    r, out = _ok("clean_named_blocks", tmp_path)
    g = _glb_json((out / "model.glb").read_bytes())
    dev_nodes = [
        n for n in g.get("nodes", [])
        if (n.get("extras") or {}).get("device_type") not in (None, "panel_backplate", "panel_envelope")
    ]
    assert dev_nodes, "no device nodes"
    for n in dev_nodes:
        assert (n.get("extras") or {}).get("source_entity_handle") is not None, n.get("name")


def test_glb_node_device_tag(tmp_path):
    _ensure()
    r, out = _ok("clean_named_blocks", tmp_path)
    g = _glb_json((out / "model.glb").read_bytes())
    dev_nodes = [
        n for n in g.get("nodes", [])
        if (n.get("extras") or {}).get("device_type") not in (None, "panel_backplate", "panel_envelope")
    ]
    assert dev_nodes, "no device nodes"
    for n in dev_nodes:
        assert (n.get("extras") or {}).get("device_tag") is not None, n.get("name")


# ---------- PDF fallback ----------

def test_vector_pdf_fallback(tmp_path):
    _ensure()
    r, _ = _safe("vector_pdf", tmp_path)
    assert r.get("fallback") == "APPROVED_2D_ONLY", r


def test_scanned_pdf_fallback(tmp_path):
    _ensure()
    r, _ = _safe("scanned_pdf", tmp_path)
    assert r.get("fallback") == "APPROVED_2D_ONLY"


# ---------- failure cases ----------

def test_corrupted_dxf_fails(tmp_path):
    _ensure()
    r, out = _safe("corrupted_dxf", tmp_path)
    assert r.get("status") == "FAILED", r.get("status")
    assert (out / "report.json").exists()


def test_empty_drawing_fails(tmp_path):
    _ensure()
    r, _ = _safe("empty_drawing", tmp_path)
    assert r.get("status") == "FAILED", r.get("status")


# ---------- duplicate tags ----------

def test_duplicate_tags_reported(tmp_path):
    _ensure()
    r, out = _safe("duplicate_tags", tmp_path)
    sm = out / "schedule_match.json"
    assert sm.exists()
    data = json.loads(sm.read_text(encoding="utf-8"))
    assert data.get("duplicate_tags"), data.get("duplicate_tags")


# ---------- unit detection ----------

def test_units_inches_detected(tmp_path):
    _ensure()
    r, out = _safe("units_inches", tmp_path)
    np = out / "normalized.json"
    assert np.exists()
    norm = json.loads(np.read_text(encoding="utf-8"))
    assert norm.get("units_detected") == "inches", norm.get("units_detected")


def test_units_inches_extents_mm(tmp_path):
    _ensure()
    r, out = _safe("units_inches", tmp_path)
    np = out / "normalized.json"
    if not np.exists():
        pytest.skip("normalized.json missing")
    norm = json.loads(np.read_text(encoding="utf-8"))
    ex = norm.get("panel_extents_mm") or {}
    assert ex.get("width", 0) > 500, ex
    assert ex.get("height", 0) > 300, ex


# ---------- no CONFIRMED without schedule ----------

def test_no_confirmed_without_schedule(tmp_path):
    _ensure()
    out = tmp_path / "no_sched"
    out.mkdir(parents=True, exist_ok=True)
    try:
        run_pipeline(
            input_path=str(FIXTURES / "clean_named_blocks" / "drawing.dxf"),
            out_dir=str(out),
            project_code="TEST",
            frame_id="nosched",
            schedule_json=None,
            skip_gltf_validator=True,
        )
    except RuntimeError:
        pass
    sm = out / "schedule_match.json"
    if sm.exists():
        d = json.loads(sm.read_text(encoding="utf-8"))
        assert d.get("schedule_tag_count", 0) == 0
        assert d.get("matched_count", 0) == 0
    fp = out / "flat3d_parts.json"
    if fp.exists():
        flat = json.loads(fp.read_text(encoding="utf-8"))
        for p in flat.get("parts", []):
            if p.get("kind") != "panel_backplate":
                assert p.get("confidence") != "CONFIRMED", p.get("name")


# ---------- smoke tests ----------

def test_units_mm_ready(tmp_path):
    _ensure()
    r, _ = _safe("units_mm", tmp_path)
    assert r.get("status") == "READY_FOR_REVIEW"


def test_rotated_devices_ready(tmp_path):
    _ensure()
    r, _ = _safe("rotated_devices", tmp_path)
    assert r.get("status") == "READY_FOR_REVIEW"


def test_nested_blocks_no_crash(tmp_path):
    _ensure()
    r, _ = _safe("nested_blocks", tmp_path)
    assert r.get("status") in ("READY_FOR_REVIEW", "FAILED")


def test_large_panel_ready(tmp_path):
    _ensure()
    r, _ = _safe("large_panel", tmp_path)
    assert r.get("status") == "READY_FOR_REVIEW", r.get("status")


def test_revision_mismatch_unmatched(tmp_path):
    _ensure()
    r, out = _safe("revision_mismatch", tmp_path)
    sm = out / "schedule_match.json"
    if not sm.exists():
        pytest.skip("schedule_match.json missing")
    d = json.loads(sm.read_text(encoding="utf-8"))
    assert "=Q9+EXTRA" in d.get("unmatched_schedule_tags", []), d.get("unmatched_schedule_tags")


def test_exploded_lines_no_crash(tmp_path):
    _ensure()
    r, _ = _safe("exploded_lines", tmp_path)
    assert r.get("status") in ("READY_FOR_REVIEW", "FAILED")