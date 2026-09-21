#!/usr/bin/env python3
"""Parse xlsx schedules via zip/xml (no openpyxl). Read-only."""
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

FRAMES = [
    ("001_E01", "/app/uploads/001/frames/frame_1785319116166_0_wcplt.xlsx"),
    ("002_a", "/app/uploads/002/frames/frame_1784977437763_0_ahv74.xlsx"),
    ("002_b", "/app/uploads/002/frames/frame_1785154448804_0_zn8m6.xlsx"),
    ("003_SIET", "/app/uploads/003/frames/frame_1789793600080_0_hhkw7.xlsx"),
]


def col_row(ref: str):
    m = re.match(r"([A-Z]+)(\d+)", ref)
    if not m:
        return 0, 0
    col = 0
    for ch in m.group(1):
        col = col * 26 + (ord(ch) - 64)
    return col - 1, int(m.group(2)) - 1


def load_sheet_rows(zf: zipfile.ZipFile, sheet_path: str, shared: list):
    root = ET.fromstring(zf.read(sheet_path))
    rows = {}
    for c in root.findall(".//m:sheetData/m:row/m:c", NS):
        ref = c.get("r")
        if not ref:
            continue
        col, row = col_row(ref)
        t = c.get("t")
        v_el = c.find("m:v", NS)
        if v_el is None or v_el.text is None:
            val = ""
        elif t == "s":
            idx = int(v_el.text)
            val = shared[idx] if idx < len(shared) else ""
        else:
            val = v_el.text
        rows.setdefault(row, {})[col] = str(val).strip()
    if not rows:
        return []
    max_col = max(max(r.keys()) for r in rows.values())
    out = []
    for r in range(0, max(rows.keys()) + 1):
        if r not in rows:
            continue
        out.append([rows[r].get(c, "") for c in range(0, max_col + 1)])
    return out


def pick(headers, row, keys):
    lower = [(i, h.lower().replace(" ", "").replace("_", "")) for i, h in enumerate(headers)]
    for k in keys:
        for i, h in lower:
            if k in h and i < len(row):
                return row[i]
    return ""


out = {"frames": {}}
for label, path in FRAMES:
    p = Path(path)
    if not p.exists():
        out["frames"][label] = {"missing": True, "path": path}
        continue
    with zipfile.ZipFile(path) as zf:
        shared = []
        if "xl/sharedStrings.xml" in zf.namelist():
            sroot = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in sroot.findall("m:si", NS):
                texts = [t.text or "" for t in si.findall(".//m:t", NS)]
                shared.append("".join(texts))
        wb = ET.fromstring(zf.read("xl/workbook.xml"))
        sheets = []
        for sh in wb.findall("m:sheets/m:sheet", NS):
            sheets.append((sh.get("name"), sh.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rid_to_target = {}
        for rel in rels:
            rid_to_target[rel.get("Id")] = rel.get("Target")
        sheet_info = []
        candidates = []
        for sname, rid in sheets[:3]:
            target = rid_to_target.get(rid, "")
            spath = "xl/" + target.lstrip("/")
            if not spath.startswith("xl/"):
                spath = "xl/" + target
            rows = load_sheet_rows(zf, spath, shared)
            headers = None
            data_rows = 0
            for i, vals in enumerate(rows):
                if not any(vals):
                    continue
                joined = " ".join(vals).upper()
                if headers is None:
                    if any(
                        k in joined
                        for k in (
                            "WIRE",
                            "CABLE",
                            "SOURCE",
                            "DEST",
                            "FROM",
                            "TO",
                            "DEVICE",
                            "TERMINAL",
                            "FERULE",
                            "FERRULE",
                        )
                    ):
                        headers = vals
                        continue
                    if i < 8:
                        continue
                    headers = [f"c{j}" for j in range(len(vals))]
                data_rows += 1
                wire = pick(
                    headers,
                    vals,
                    ["wireno", "wirenumber", "wire", "cableno", "cable", "core", "ferule", "ferrule"],
                )
                src_dev = pick(
                    headers,
                    vals,
                    ["sourcedevice", "fromdevice", "srcdevice", "fromeq", "sourcedev"],
                )
                src_term = pick(
                    headers,
                    vals,
                    ["sourceterminal", "fromterminal", "srcterm", "fromterm", "sourceterm"],
                )
                dst_dev = pick(
                    headers,
                    vals,
                    ["destdevice", "todevice", "dstdevice", "toeq", "destdev"],
                )
                dst_term = pick(
                    headers,
                    vals,
                    ["destterminal", "toterminal", "dstterm", "toterm", "destterm"],
                )
                if src_dev and dst_dev and src_dev.upper() != dst_dev.upper():
                    candidates.append(
                        {
                            "sheet": sname,
                            "wire": wire,
                            "source_device": src_dev,
                            "source_terminal": src_term,
                            "dest_device": dst_dev,
                            "dest_terminal": dst_term,
                        }
                    )
            sheet_info.append({"name": sname, "headers": headers, "data_rows": data_rows, "row_count": len(rows)})
        uniq = {}
        for c in candidates:
            key = (c["wire"], c["source_device"].upper(), c["dest_device"].upper(), c["source_terminal"], c["dest_terminal"])
            uniq[key] = c
        cand_list = list(uniq.values())
        out["frames"][label] = {
            "path": path,
            "sheets": sheet_info,
            "candidate_count": len(cand_list),
            "sample_candidates": cand_list[:30],
            "known_targets": [
                c
                for c in cand_list
                if any(
                    t in (c["source_device"] + "|" + c["dest_device"] + "|" + c["wire"]).upper()
                    for t in ("KF87L", "H74", "87STUB", "QDC1", "X420", "021", "20.16")
                )
            ][:25],
        }

out_path = Path("/tmp/livetb_frame_search.json")
out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
print(json.dumps({
    "wrote": str(out_path),
    "summary": {
        k: {
            "candidates": v.get("candidate_count"),
            "headers0": (v.get("sheets") or [{}])[0].get("headers"),
            "sample": (v.get("sample_candidates") or [])[:5],
            "known": v.get("known_targets"),
        }
        for k, v in out["frames"].items()
    },
}, indent=2)[:25000])
