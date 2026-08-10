"""Exact schedule matching — preserve engineering symbols; no unsafe fuzzy substitution."""
from __future__ import annotations
import re
from typing import Any


def normalize_ref(value: str) -> str:
    return re.sub(r"\s+", "", str(value or "")).upper()


def load_schedule_tags(path: str | None) -> set[str]:
    if not path:
        return set()
    import json
    from pathlib import Path
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    tags: set[str] = set()
    if isinstance(data, list):
        for row in data:
            if isinstance(row, str):
                tags.add(row)
            elif isinstance(row, dict):
                for k in ("device_tag", "tag", "source_device", "dest_device"):
                    if row.get(k):
                        tags.add(str(row[k]))
    elif isinstance(data, dict) and "tags" in data:
        tags.update(str(t) for t in data["tags"])
    return tags


def match_schedule(objects: list[dict[str, Any]], schedule_tags: set[str]) -> dict[str, Any]:
    norm_sched = {normalize_ref(t): t for t in schedule_tags}
    matched = []
    unmatched_schedule = set(norm_sched.keys())
    duplicates: dict[str, int] = {}
    seen: dict[str, int] = {}
    for obj in objects:
        tag = obj.get("device_tag")
        if not tag:
            continue
        key = normalize_ref(tag)
        seen[key] = seen.get(key, 0) + 1
        if key in norm_sched:
            matched.append({"object_tag": tag, "schedule_tag": norm_sched[key], "confidence": obj.get("confidence")})
            unmatched_schedule.discard(key)
            # Upgrade confidence when exact match
            if obj.get("confidence") in ("HIGH_CONFIDENCE", "REVIEW_REQUIRED", "UNRESOLVED"):
                obj["confidence"] = "CONFIRMED"
                obj.setdefault("evidence", []).append("schedule_exact_match")
    for k, n in seen.items():
        if n > 1:
            duplicates[norm_sched.get(k, k)] = n
    return {
        "schedule_tag_count": len(schedule_tags),
        "matched": matched,
        "matched_count": len(matched),
        "unmatched_schedule_tags": [norm_sched[k] for k in sorted(unmatched_schedule)],
        "duplicate_tags": duplicates,
    }