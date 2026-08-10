"""Verify all fixtures through the flat3d pipeline and write structured reports.

Exit 0  -- all core DXF fixtures (clean_named_blocks, units_mm, rotated_devices) pass READY_FOR_REVIEW.
Exit 1  -- at least one core fixture failed.

Expected failures (corrupt/empty/pdf) are recorded as expected_fail or approved_2d and do NOT
count against the overall pass/fail verdict.

Run:
    cd scripts/flat3d-conversion
    python verify_all.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from flat3d.pipeline import run_pipeline
import build_fixtures

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
REPORTS_DIR = Path(__file__).resolve().parent / "reports"

# Core fixtures that MUST reach READY_FOR_REVIEW
CORE_FIXTURES = ["clean_named_blocks", "units_mm", "rotated_devices"]

# Fixtures whose failure is expected
EXPECTED_OUTCOME = {
    "corrupted_dxf": "expected_fail",
    "empty_drawing": "expected_fail",
    "corrupted_dwg": "expected_fail",
    "vector_pdf": "approved_2d",
    "scanned_pdf": "approved_2d",
}

ALL_FIXTURES = list(build_fixtures.BUILDERS.keys())


def run_one(name: str, out_dir: Path) -> dict:
    fixture_dir = FIXTURES_DIR / name
    draw = None
    for ext in (".dxf", ".pdf", ".dwg"):
        cand = fixture_dir / ("drawing" + ext)
        if cand.exists():
            draw = cand
            break
    if draw is None:
        return {"status": "FAILED", "error": "no drawing file found"}

    sched = fixture_dir / "schedule.json"
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        return run_pipeline(
            input_path=str(draw),
            out_dir=str(out_dir),
            project_code="VERIFY",
            frame_id=name,
            schedule_json=str(sched) if sched.exists() else None,
            skip_gltf_validator=True,
        )
    except RuntimeError as exc:
        rp = out_dir / "report.json"
        if rp.exists():
            return json.loads(rp.read_text(encoding="utf-8"))
        return {"status": "FAILED", "error": str(exc)}


def main() -> int:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    print("Ensuring fixtures are built ...")
    build_fixtures.build_all(force=False)
    print()

    summary: dict = {}
    core_failures: list = []

    for name in ALL_FIXTURES:
        print(f"  [{name}] ...", end=" ", flush=True)
        out_dir = REPORTS_DIR / name
        report = run_one(name, out_dir)
        status = report.get("status", "FAILED")
        fallback = report.get("fallback")
        glb_path = out_dir / "model.glb"
        glb_bytes = glb_path.stat().st_size if glb_path.exists() else 0
        overlay = report.get("overlay") or {}
        expected = EXPECTED_OUTCOME.get(name)

        if expected == "approved_2d":
            verdict = "PASS" if fallback == "APPROVED_2D_ONLY" else "UNEXPECTED"
        elif expected == "expected_fail":
            verdict = "PASS" if status == "FAILED" else "UNEXPECTED"
        else:
            verdict = "PASS" if status == "READY_FOR_REVIEW" else "FAIL"

        print(verdict)

        entry = {
            "status": status,
            "fallback": fallback,
            "verdict": verdict,
            "expected_outcome": expected,
            "glb_bytes": glb_bytes,
            "overlay": overlay,
        }
        summary[name] = entry

        per_path = REPORTS_DIR / name / "report_summary.json"
        per_path.parent.mkdir(parents=True, exist_ok=True)
        per_path.write_text(
            json.dumps({"fixture": name, **entry}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        if name in CORE_FIXTURES and verdict != "PASS":
            core_failures.append(name)

    (REPORTS_DIR / "SUMMARY.json").write_text(
        json.dumps(
            {
                "core_fixtures": CORE_FIXTURES,
                "core_pass": len(core_failures) == 0,
                "core_failures": core_failures,
                "fixtures": summary,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 60)
    total = len(ALL_FIXTURES)
    passed = sum(1 for v in summary.values() if v["verdict"] == "PASS")
    failed = sum(1 for v in summary.values() if v["verdict"] in ("FAIL", "UNEXPECTED"))
    print(f"SUMMARY: {passed}/{total} fixtures passed")
    if core_failures:
        print(f"CORE FAILURES: {core_failures}")
        print("OVERALL RESULT: FAIL")
        return 1
    print("CORE FIXTURES: all PASS")
    print(f"OVERALL RESULT: PASS  (non-core results: {passed - len([n for n in CORE_FIXTURES])}/{total - len(CORE_FIXTURES)} others passed)")
    print(f"Report: {REPORTS_DIR / 'SUMMARY.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())