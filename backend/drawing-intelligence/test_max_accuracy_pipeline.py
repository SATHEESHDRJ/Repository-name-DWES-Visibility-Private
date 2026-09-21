# -*- coding: utf-8 -*-
"""Unit tests for tiling + OCR normalize + health + grounding providers."""
from __future__ import annotations

import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tiling import generate_tiles, tile_local_to_page_norm
from ocr_providers import constrained_normalize
from health_probe import build_health
from locate_anything import LocalLocateAnythingProvider, LocateAnythingGroundingProvider
from visual_grounding_provider import (
    UnavailableGroundingProvider,
    RemoteLocateAnythingProvider,
    get_visual_grounding_provider,
    build_grounding_cache_key,
    build_drawing_identity,
    JOB_STAGES,
    STAGE_VISUAL_GROUNDING,
)


class TilingTests(unittest.TestCase):
    def test_overlap_tiles(self):
        tiles = generate_tiles(2000, 1500, page=1, dpi=350, tile_size=1024, overlap_ratio=0.15)
        self.assertGreater(len(tiles), 1)
        t0 = tiles[0]
        self.assertEqual(t0["page"], 1)
        self.assertIn("tile_id", t0)
        self.assertEqual(t0["dpi"], 350)
        page_box = tile_local_to_page_norm(t0, 10, 20, 100, 50)
        self.assertGreater(page_box["width"], 0)
        self.assertLessEqual(page_box["x"], 1.0)


class OcrNormalizeTests(unittest.TestCase):
    def test_constrained_x321(self):
        r = constrained_normalize("X32I", ["X321", "X9"])
        self.assertEqual(r["normalized_candidate"], "X321")
        self.assertEqual(r["raw_ocr"], "X32I")
        self.assertIn("constrained", r["normalization_reason"])

    def test_no_blind_global(self):
        r = constrained_normalize("X99Z", ["X321"])
        self.assertEqual(r["normalization_reason"], "no_expected_match")


class HealthTests(unittest.TestCase):
    def test_health_shape(self):
        prev = os.environ.get("DWES_GROUNDING_EXECUTION_MODE")
        os.environ["DWES_GROUNDING_EXECUTION_MODE"] = "future_cloud"
        try:
            h = build_health()
            for key in (
                "tesseract", "paddleocr", "locate_anything", "locate_model_loaded",
                "locate_mode", "opencv", "gpu", "cuda", "ok", "locate_anything_provider",
            ):
                self.assertIn(key, h)
            self.assertTrue(h["ok"])
            detail = h["locate_anything_provider"]
            self.assertEqual(detail["execution_mode"], "future_cloud")
            self.assertFalse(detail["available"])
            self.assertEqual(detail["status"], "GROUNDING_UNAVAILABLE")
            self.assertFalse(h["locate_model_loaded"])
        finally:
            if prev is None:
                os.environ.pop("DWES_GROUNDING_EXECUTION_MODE", None)
            else:
                os.environ["DWES_GROUNDING_EXECUTION_MODE"] = prev


class LocateTests(unittest.TestCase):
    def test_local_unavailable_without_enable(self):
        os.environ.pop("DWES_LOCATE_ENABLE", None)
        p = LocateAnythingGroundingProvider()
        probe = p.health_probe()
        self.assertFalse(probe["locate_model_loaded"])
        self.assertIn(probe["locate_status"], ("LOCATE_UNAVAILABLE", "GROUNDING_UNAVAILABLE"))
        g = p.ground_header(header="X321", tiles=[])
        self.assertTrue(g.get("grounding_unavailable") or g.get("locate_status") in (
            "LOCATE_UNAVAILABLE", "GROUNDING_UNAVAILABLE",
        ))
        self.assertEqual(g.get("text_hits"), [])
        self.assertEqual(g.get("physical_hits"), [])

    def test_unavailable_provider_no_fake_boxes(self):
        p = UnavailableGroundingProvider(execution_mode="future_cloud")
        h = p.health()
        self.assertFalse(h["available"])
        self.assertEqual(h["status"], "GROUNDING_UNAVAILABLE")
        g = p.ground_header(header="X9", tiles=[{"tile_id": "t1"}])
        self.assertTrue(g["grounding_unavailable"])
        self.assertEqual(g["text_hits"], [])
        self.assertEqual(g["physical_hits"], [])
        self.assertEqual(g["locate_status"], "GROUNDING_UNAVAILABLE")
        tile = p.analyse_tile(header="X9", tile={"tile_id": "t1"})
        self.assertEqual(tile["text_hits"], [])
        self.assertEqual(tile["physical_hits"], [])

    def test_factory_defaults_to_unavailable(self):
        prev = os.environ.get("DWES_GROUNDING_EXECUTION_MODE")
        os.environ["DWES_GROUNDING_EXECUTION_MODE"] = "future_cloud"
        try:
            p = get_visual_grounding_provider()
            self.assertIsInstance(p, UnavailableGroundingProvider)
            g = p.locate_physical_tb_group(header="XTA-1", tiles=[])
            self.assertTrue(g["grounding_unavailable"])
            self.assertEqual(g["physical_hits"], [])
        finally:
            if prev is None:
                os.environ.pop("DWES_GROUNDING_EXECUTION_MODE", None)
            else:
                os.environ["DWES_GROUNDING_EXECUTION_MODE"] = prev

    def test_remote_without_url_is_unavailable(self):
        prev = os.environ.get("DWES_GROUNDING_REMOTE_URL")
        os.environ.pop("DWES_GROUNDING_REMOTE_URL", None)
        try:
            p = RemoteLocateAnythingProvider()
            h = p.health()
            self.assertFalse(h["available"])
            self.assertEqual(h["execution_mode"], "remote_gpu")
            g = p.locate_text(header="X9", tiles=[])
            self.assertTrue(g["grounding_unavailable"])
            self.assertEqual(g["text_hits"], [])
        finally:
            if prev is None:
                os.environ.pop("DWES_GROUNDING_REMOTE_URL", None)
            else:
                os.environ["DWES_GROUNDING_REMOTE_URL"] = prev

    def test_cache_and_identity_helpers(self):
        key = build_grounding_cache_key(
            drawing_checksum="abc",
            page=1,
            tile="p1_t0",
            expected_header="x9",
            model_revision="rev1",
            generation_mode="hybrid",
        )
        self.assertEqual(key.split("|")[0], "abc")
        self.assertEqual(key.split("|")[3], "X9")
        ident = build_drawing_identity(
            project_code="001",
            frame_id="frame_1",
            slot="2d",
            revision="R1",
            checksum="DEADBEEF",
        )
        self.assertEqual(ident["project_code"], "001")
        self.assertEqual(ident["checksum"], "deadbeef")
        self.assertNotIn("\\", json.dumps(ident))
        self.assertIn(STAGE_VISUAL_GROUNDING, JOB_STAGES)
        self.assertIs(LocalLocateAnythingProvider, LocateAnythingGroundingProvider)


if __name__ == "__main__":
    unittest.main()
