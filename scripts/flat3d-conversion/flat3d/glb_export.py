"""Minimal glTF 2.0 binary exporter for Flat 3D boxes (no textures)."""
from __future__ import annotations
import json
import struct
from typing import Any


def export_glb(flat: dict[str, Any], *, project_code: str, frame_id: str, drawing_revision: str | int | None) -> bytes:
    parts = [p for p in flat.get("parts", []) if p.get("sx", 0) > 0 and p.get("sy", 0) > 0 and p.get("sz", 0) > 0]
    if not parts:
        raise ValueError("No parts to export — refusing empty GLB")

    # Build one mesh per part (box) — simple, traceable
    bin_chunks: list[bytes] = []
    accessors = []
    buffer_views = []
    meshes = []
    nodes = []
    materials = [
        {"name": "engineering", "pbrMetallicRoughness": {"baseColorFactor": [0.75, 0.78, 0.82, 1], "metallicFactor": 0.3, "roughnessFactor": 0.55}},
        {"name": "suggested", "pbrMetallicRoughness": {"baseColorFactor": [0.96, 0.72, 0.2, 0.65], "metallicFactor": 0.0, "roughnessFactor": 0.9}},
        {"name": "panel", "pbrMetallicRoughness": {"baseColorFactor": [0.88, 0.88, 0.86, 1], "metallicFactor": 0.35, "roughnessFactor": 0.5}},
    ]

    offset = 0
    for i, p in enumerate(parts):
        positions, normals, indices = _box_geometry(
            p["sx"] / 1000.0, p["sy"] / 1000.0, p["sz"] / 1000.0
        )
        pos_b = _f32(positions)
        nrm_b = _f32(normals)
        idx_b = _u16(indices)
        # align
        for blob in (pos_b, nrm_b, idx_b):
            pad = (4 - (len(blob) % 4)) % 4
            if pad:
                blob = blob + b"\x00" * pad
        # Actually rebuild with padding separately
        pos_b = _pad4(_f32(positions))
        nrm_b = _pad4(_f32(normals))
        idx_b = _pad4(_u16(indices))

        bv_pos = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(pos_b), "target": 34962})
        offset += len(pos_b)
        bin_chunks.append(pos_b)

        bv_nrm = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(nrm_b), "target": 34962})
        offset += len(nrm_b)
        bin_chunks.append(nrm_b)

        bv_idx = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(idx_b), "target": 34963})
        offset += len(idx_b)
        bin_chunks.append(idx_b)

        xmin, xmax = min(positions[0::3]), max(positions[0::3])
        ymin, ymax = min(positions[1::3]), max(positions[1::3])
        zmin, zmax = min(positions[2::3]), max(positions[2::3])
        acc_pos = len(accessors)
        accessors.append({
            "bufferView": bv_pos, "componentType": 5126, "count": len(positions) // 3, "type": "VEC3",
            "max": [xmax, ymax, zmax], "min": [xmin, ymin, zmin],
        })
        acc_nrm = len(accessors)
        accessors.append({"bufferView": bv_nrm, "componentType": 5126, "count": len(normals) // 3, "type": "VEC3"})
        acc_idx = len(accessors)
        accessors.append({"bufferView": bv_idx, "componentType": 5123, "count": len(indices), "type": "SCALAR"})

        mat = 2 if p.get("kind") == "panel_backplate" else (0 if p.get("authoritative") else 1)
        mesh_index = len(meshes)
        meshes.append({
            "primitives": [{
                "attributes": {"POSITION": acc_pos, "NORMAL": acc_nrm},
                "indices": acc_idx,
                "material": mat,
            }]
        })
        nodes.append({
            "name": p.get("name") or f"part_{i}",
            "mesh": mesh_index,
            "translation": [p["cx"] / 1000.0, p["cy"] / 1000.0, p["cz"] / 1000.0],
            "extras": {
                "project_code": project_code,
                "panel_id": frame_id,
                "drawing_revision": drawing_revision,
                "source_entity_handle": p.get("source_handle"),
                "source_layer": p.get("source_layer"),
                "device_tag": p.get("device_tag"),
                "device_type": p.get("kind"),
                "geometry_confidence": p.get("confidence"),
                "mapping_status": "authoritative" if p.get("authoritative") else "suggested",
                "depth_source": p.get("depth_source"),
            },
        })

    blob = b"".join(bin_chunks)
    gltf = {
        "asset": {"version": "2.0", "generator": "DWES-flat3d-conversion"},
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "materials": materials,
        "meshes": meshes,
        "nodes": nodes,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "scene": 0,
    }
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    json_bytes += b" " * json_pad
    bin_pad = (4 - (len(blob) % 4)) % 4
    blob += b"\x00" * bin_pad

    total = 12 + 8 + len(json_bytes) + 8 + len(blob)
    out = bytearray()
    out += struct.pack("<4sII", b"glTF", 2, total)
    out += struct.pack("<I4s", len(json_bytes), b"JSON")
    out += json_bytes
    out += struct.pack("<I4s", len(blob), b"BIN\x00")
    out += blob
    return bytes(out)


def _box_geometry(sx: float, sy: float, sz: float):
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    # 8 corners expanded to 24 verts (per-face normals)
    faces = [
        # +Z
        ([(-hx,-hy,hz),(hx,-hy,hz),(hx,hy,hz),(-hx,hy,hz)], (0,0,1)),
        # -Z
        ([(hx,-hy,-hz),(-hx,-hy,-hz),(-hx,hy,-hz),(hx,hy,-hz)], (0,0,-1)),
        # +Y
        ([(-hx,hy,-hz),(-hx,hy,hz),(hx,hy,hz),(hx,hy,-hz)], (0,1,0)),
        # -Y
        ([(-hx,-hy,hz),(-hx,-hy,-hz),(hx,-hy,-hz),(hx,-hy,hz)], (0,-1,0)),
        # +X
        ([(hx,-hy,hz),(hx,-hy,-hz),(hx,hy,-hz),(hx,hy,hz)], (1,0,0)),
        # -X
        ([(-hx,-hy,-hz),(-hx,-hy,hz),(-hx,hy,hz),(-hx,hy,-hz)], (-1,0,0)),
    ]
    positions = []
    normals = []
    indices = []
    for verts, n in faces:
        base = len(positions) // 3
        for v in verts:
            positions.extend(v)
            normals.extend(n)
        indices.extend([base, base+1, base+2, base, base+2, base+3])
    return positions, normals, indices


def _f32(vals):
    return struct.pack(f"<{len(vals)}f", *vals)

def _u16(vals):
    return struct.pack(f"<{len(vals)}H", *vals)

def _pad4(b: bytes) -> bytes:
    pad = (4 - (len(b) % 4)) % 4
    return b + (b"\x00" * pad)