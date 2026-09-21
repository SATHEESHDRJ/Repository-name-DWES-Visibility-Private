"""CLI entry: python -m flat3d.cli --input ... --out ..."""
from __future__ import annotations
import argparse
import json
import os
import sys
from pathlib import Path

# Allow running as script from scripts/flat3d-conversion
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flat3d.pipeline import run_pipeline


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="DWES drawing-first Flat 3D conversion")
    p.add_argument("--input", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--project-code", required=True)
    p.add_argument("--frame-id", required=True)
    p.add_argument("--drawing-revision", default=None)
    p.add_argument("--schedule-json", default=None)
    p.add_argument("--rules-json", default=None)
    p.add_argument("--depth-lib", default=None)
    p.add_argument("--libredwg-bin-dir", default=os.environ.get("DWES_LIBREDWG_BIN_DIR"))
    p.add_argument("--skip-gltf-validator", action="store_true")
    args = p.parse_args(argv)
    try:
        report = run_pipeline(
            input_path=args.input,
            out_dir=args.out,
            project_code=args.project_code,
            frame_id=args.frame_id,
            drawing_revision=args.drawing_revision,
            schedule_json=args.schedule_json,
            rules_json=args.rules_json,
            depth_lib_json=args.depth_lib,
            libredwg_bin_dir=args.libredwg_bin_dir,
            skip_gltf_validator=args.skip_gltf_validator,
        )
        print(json.dumps({"ok": report.get("status") == "READY_FOR_REVIEW", "report": report}, indent=2))
        return 0 if report.get("status") == "READY_FOR_REVIEW" else 2
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())