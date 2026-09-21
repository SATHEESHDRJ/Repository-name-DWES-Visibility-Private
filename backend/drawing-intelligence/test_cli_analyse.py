"""Unit tests for drawing-intelligence CLI helpers (no OCR required)."""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("cli_analyse", ROOT / "cli_analyse.py")
cli = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(cli)


class CliAnalyseHelpersTest(unittest.TestCase):
    def test_legend_not_physical(self):
        self.assertEqual(
            cli.classify_neighborhood("TB-FEEDTHROUGHTYPE-SPARECIRCUIT"),
            "legend_or_table",
        )
        self.assertFalse(cli.is_physical_strip("legend_or_table"))
        self.assertEqual(cli.classify_neighborhood("1-12TERMINALS"), "strip_candidate")
        self.assertTrue(cli.is_physical_strip("strip_candidate"))

    def test_find_terminal_range_never_invents_1_12(self):
        self.assertEqual(cli.find_terminal_range("X7 ONLY", "X7"), ("", False))
        self.assertEqual(cli.find_terminal_range("X7 1-24 TERMINALS", "X7"), ("1-24", True))

    def test_ocr_confusion_only_expected_set(self):
        variants = cli.ocr_confusion_variants("X9")
        self.assertIn("X9", variants)
        # Noise token not in expected variants is rejected by design of the set
        self.assertNotIn("RANDOM", variants)

    def test_missing_drawing_returns_explicit_notes(self):
        result = cli.analyse(
            {
                "drawing_path": str(ROOT / "_does_not_exist.pdf"),
                "expected_headers": ["X7"],
            }
        )
        self.assertEqual(result["notes"], ["drawing_missing"])
        self.assertEqual(result["candidates"], [])
        self.assertEqual(result["headers_missing"], ["X7"])

    def test_score_high_requires_range_or_cells(self):
        # HIGH requires a real box (max-accuracy); range alone without geometry is MEDIUM.
        conf, _, _ = cli.score_candidate(
            header_exact=True,
            terminal_range_found=True,
            strong_cell_pattern=False,
            unique=True,
            ocr_only_weak=False,
            peers=0,
            eligible_view=True,
            has_real_box=True,
        )
        self.assertEqual(conf, "HIGH")
        conf_medium, _, _ = cli.score_candidate(
            header_exact=True,
            terminal_range_found=True,
            strong_cell_pattern=False,
            unique=True,
            ocr_only_weak=False,
            peers=0,
        )
        self.assertEqual(conf_medium, "MEDIUM")
        conf2, _, _ = cli.score_candidate(
            header_exact=True,
            terminal_range_found=False,
            strong_cell_pattern=False,
            unique=True,
            ocr_only_weak=True,
            peers=0,
        )
        self.assertNotEqual(conf2, "HIGH")


if __name__ == "__main__":
    unittest.main()
