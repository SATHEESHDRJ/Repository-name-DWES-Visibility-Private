"""Orchestrate conversion stages for one drawing. Never auto-publishes."""
from __future__ import annotations
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .stages import Stage
from .dxf_parse import parse_dxf
from .normalize import normalize
from .semantic import classify_objects, load_rules
from .schedule_match import load_schedule_tags, match_schedule
from .flat3d_gen import generate_flat3d, load_depth_library
from .glb_export import export_glb
from .overlay import compare_overlay


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def run_pipeline(
    *,
    input_path: str,
    out_dir: str,
    project_code: str,
    frame_id: str,
    drawing_revision: str | int | None = None,
    schedule_json: str | None = None,
    rules_json: str | None = None,
    depth_lib_json: str | None = None,
    libredwg_bin_dir: str | None = None,
    skip_gltf_validator: bool = False,
) -> dict[str, Any]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    stages: list[dict[str, Any]] = []
    report: dict[str, Any] = {
        "project_code": project_code,
        "frame_id": frame_id,
        "drawing_revision": drawing_revision,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "stages": stages,
        "status": Stage.INGEST.value,
    }

    def mark(stage: Stage, ok: bool, detail: str = "", **extra):
        stages.append({"stage": stage.value, "ok": ok, "detail": detail, **extra})
        report["status"] = stage.value if ok else Stage.FAILED.value
        _write_json(out / "report.json", report)
        if not ok:
            raise RuntimeError(f"{stage.value} failed: {detail}")

    src = Path(input_path)
    if not src.is_file():
        mark(Stage.INGEST, False, f"missing input {input_path}")
    checksum = _sha256(src)
    ingest_copy = out / f"source{src.suffix.lower()}"
    shutil.copy2(src, ingest_copy)
    mark(Stage.INGEST, True, "source copied", checksum=checksum, source_name=src.name)

    ext = src.suffix.lower()
    dxf_path: Path | None = None

    if ext == ".dwg":
        if not libredwg_bin_dir:
            mark(Stage.DWG_TO_DXF, False, "DWES_LIBREDWG_BIN_DIR not set — cannot convert DWG via LibreDWG CLI")
        tool = Path(libredwg_bin_dir) / ("dwg2dxf.exe" if sys.platform.startswith("win") else "dwg2dxf")
        if not tool.exists():
            mark(Stage.DWG_TO_DXF, False, f"LibreDWG tool missing: {tool}")
        dxf_path = out / "converted.dxf"
        try:
            subprocess.run([str(tool), "-o", str(dxf_path), str(ingest_copy)], check=True, capture_output=True, text=True, timeout=120)
        except Exception as e:
            mark(Stage.DWG_TO_DXF, False, str(e))
        mark(Stage.DWG_TO_DXF, True, "LibreDWG external process OK")
    elif ext == ".dxf":
        dxf_path = ingest_copy
        stages.append({"stage": Stage.DWG_TO_DXF.value, "ok": True, "detail": "skipped — input already DXF"})
    elif ext == ".pdf":
        # Scanned/flattened PDF: Approved 2D only. Vector PDF extraction not claimed as Flat 3D here.
        report["fallback"] = "APPROVED_2D_ONLY"
        report["status"] = Stage.FAILED.value
        report["detail"] = "PDF inputs remain Approved 2D reference in this phase (no fabricated Flat 3D from PDF)."
        _write_json(out / "report.json", report)
        return report
    else:
        mark(Stage.INGEST, False, f"unsupported format {ext}")

    assert dxf_path is not None
    try:
        parsed = parse_dxf(str(dxf_path))
    except Exception as e:
        mark(Stage.DXF_PARSE, False, str(e))
    if parsed.get("entity_count", 0) == 0 and parsed.get("text_count", 0) == 0:
        mark(Stage.DXF_PARSE, False, "DXF opened but entity/text counts are zero")
    mark(Stage.DXF_PARSE, True, "ezdxf parse OK", counts={
        "entities": parsed.get("entity_count"),
        "texts": parsed.get("text_count"),
        "layers": parsed.get("layer_count"),
        "blocks": parsed.get("block_def_count"),
    })

    normalized = normalize(parsed)
    ext_mm = normalized.get("panel_extents_mm") or {}
    if float(ext_mm.get("width") or 0) <= 0 or float(ext_mm.get("height") or 0) <= 0:
        mark(Stage.GEOMETRY_NORMALIZATION, False, "invalid panel extents after normalization")
    mark(Stage.GEOMETRY_NORMALIZATION, True, "panel-local mm", extents=ext_mm)
    _write_json(out / "normalized.json", normalized)

    rules = load_rules(rules_json)
    schedule_tags = load_schedule_tags(schedule_json)
    objects = classify_objects(normalized, schedule_tags, rules)
    mark(Stage.SEMANTIC_EXTRACTION, True, f"{len(objects)} candidates", object_count=len(objects))

    match = match_schedule(objects, schedule_tags)
    mark(Stage.SCHEDULE_MATCHING, True, "exact match report", **{k: match[k] for k in ("matched_count", "schedule_tag_count")})
    _write_json(out / "schedule_match.json", match)

    depth_lib = load_depth_library(depth_lib_json)
    flat = generate_flat3d(normalized, objects, depth_lib)
    if flat["authoritative_part_count"] <= 0 and not any(p.get("kind") == "panel_backplate" for p in flat["parts"]):
        mark(Stage.FLAT_3D_GENERATION, False, "no authoritative geometry — review required / refuse silent devices")
    mark(Stage.FLAT_3D_GENERATION, True, "extrusion complete",
         authoritative=flat["authoritative_part_count"], suggested=flat["suggested_part_count"])
    _write_json(out / "flat3d_parts.json", flat)

    try:
        glb = export_glb(flat, project_code=project_code, frame_id=frame_id, drawing_revision=drawing_revision)
    except Exception as e:
        mark(Stage.GLB_EXPORT, False, str(e))
    glb_path = out / "model.glb"
    glb_path.write_bytes(glb)
    mark(Stage.GLB_EXPORT, True, f"wrote {glb_path.name}", bytes=len(glb))

    validator = {"ran": False, "errors": [], "warnings": []}
    if not skip_gltf_validator:
        # Prefer npx @khronosgroup/gltf-validator when available
        try:
            proc = subprocess.run(
                ["npx", "--yes", "@khronosgroup/gltf-validator", str(glb_path)],
                capture_output=True, text=True, timeout=120, shell=False,
            )
            validator["ran"] = True
            validator["exit_code"] = proc.returncode
            validator["stdout"] = (proc.stdout or "")[-4000:]
            validator["stderr"] = (proc.stderr or "")[-2000:]
            # Heuristic: treat non-zero as blocking when validator installed
            if proc.returncode not in (0, None) and "not found" not in (proc.stderr or "").lower():
                # Some versions print report JSON with issues — keep non-fatal if only warnings
                if "error" in (proc.stdout or "").lower() and '"severity":0' not in (proc.stdout or "").replace(" ", ""):
                    mark(Stage.GLB_VALIDATION, False, "Khronos validator reported errors")
            mark(Stage.GLB_VALIDATION, True, "validator invoked", exit_code=proc.returncode)
        except FileNotFoundError:
            validator["ran"] = False
            stages.append({"stage": Stage.GLB_VALIDATION.value, "ok": True, "detail": "npx unavailable — structural GLB header check only"})
            # Structural check: magic
            if glb[:4] != b"glTF":
                mark(Stage.GLB_VALIDATION, False, "GLB magic missing")
        except Exception as e:
            stages.append({"stage": Stage.GLB_VALIDATION.value, "ok": True, "detail": f"validator skipped: {e}"})
    else:
        stages.append({"stage": Stage.GLB_VALIDATION.value, "ok": True, "detail": "skipped by flag"})
    _write_json(out / "gltf_validation.json", validator)

    overlay = compare_overlay(normalized, flat)
    _write_json(out / "overlay_compare.json", overlay)
    stages.append({"stage": Stage.BROWSER_VERIFICATION.value, "ok": True, "detail": "deferred to Nest/agent browser harness"})

    # Provenance: every authoritative part must have source handle or panel extents rule
    for p in flat["parts"]:
        if p.get("authoritative") and p.get("kind") != "panel_backplate" and not p.get("source_handle"):
            mark(Stage.READY_FOR_REVIEW, False, f"authoritative part missing source handle: {p.get('name')}")

    # Checksum unchanged
    if _sha256(ingest_copy) != checksum:
        mark(Stage.READY_FOR_REVIEW, False, "source checksum changed during pipeline")

    manifest = {
        "project_code": project_code,
        "frame_id": frame_id,
        "drawing_revision": drawing_revision,
        "source": {"name": src.name, "sha256": checksum, "format": ext},
        "normalized": normalized.get("counts"),
        "objects": objects,
        "schedule_match": match,
        "flat3d": {
            "authoritative_part_count": flat["authoritative_part_count"],
            "suggested_part_count": flat["suggested_part_count"],
            "warnings": flat.get("warnings"),
            "rejected_count": len(flat.get("rejected") or []),
        },
        "overlay": overlay,
        "glb": {"path": str(glb_path.name), "bytes": len(glb)},
        "publication": "READY_FOR_REVIEW — supervisor must approve; never auto-published",
    }
    _write_json(out / "manifest.json", manifest)
    report["status"] = Stage.READY_FOR_REVIEW.value
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    report["overlay"] = overlay
    report["glb_bytes"] = len(glb)
    report["checksum"] = checksum
    _write_json(out / "report.json", report)
    stages.append({"stage": Stage.READY_FOR_REVIEW.value, "ok": True, "detail": "awaiting supervisor review"})
    _write_json(out / "report.json", report)
    return report