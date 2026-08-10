# DWES Engineering Geometry Package — Specification (v1)

The structured data package the Chennai design team supplies **per panel** to enable
the Cable Digital Twin's Flat 3D and Calculated Guidance modes. One JSON file per
panel per model revision.

## Pipeline

```
Chennai completes package
→ Validator approves package        POST /api/engineering/validate/:project/:frame   (dry-run, no writes)
→ DWES import workflow reads it     POST /api/engineering/import/:project/:frame     (creates a DRAFT revision)
→ Engineering user reviews mappings GET  /api/engineering/review/:modelId            (schedule-match report)
→ Supervisor approves revision      POST /api/engineering/approve/:modelId           (supervisor/system admin only)
→ Model is published                (same call — sets published_at; previous published revision → superseded)
→ Technician sees Flat 3D / Calculated Guidance via the Cable Digital Twin
```

**Safety:** drafts are never visible to technicians — the twin-context endpoint only
reads revisions with `approval_status = approved` **and** `published_at` set.
A failed validation writes nothing. Re-importing the same `model_revision` for a
panel is rejected (revision history is never silently replaced).

## File format

`Content-Type: application/json`, UTF-8. All coordinates and dimensions in **mm**
(`units` must be `"mm"` — DWES performs no silent unit conversion). Coordinate
system: origin at the panel's bottom-left-front corner; X → width (right),
Y → height (up), Z → depth (into the panel). Device x/y/z is the footprint centre.

Engineering symbols in tags (`= + - : / .`) are preserved exactly; matching against
the wiring schedule uses case/whitespace-insensitive comparison of
`DEVICE:TERMINAL` references.

```jsonc
{
  "package_type": "dwes-engineering-package",
  "spec_version": 1,
  "project_code": "001",                  // must match the import target
  "frame_id": "frame_...",                // must match the import target
  "model_revision": "R1",                 // unique per panel
  "units": "mm",
  "drawing_number": "GA-001-H001",        // optional
  "drawing_revision": "Rev 1",            // optional
  "panel": { "width": 800, "height": 2000, "depth": 600 },
  "devices": [
    {
      "device_tag": "=H001+K1",           // exactly as it appears in the wiring schedule
      "device_type": "protection_relay",  // optional
      "manufacturer": "ABB",              // optional
      "model": "REF615",                  // optional
      "x": 400, "y": 1500, "z": 300,
      "width": 160, "height": 220, "depth": 150,
      "terminals": [
        { "terminal_number": "13", "terminal_block": "X1", "x": 360, "y": 1420, "z": 300 },
        { "terminal_number": "14", "terminal_block": "X1", "x": 380, "y": 1420, "z": 300 }
      ]
    }
  ],
  "duct_nodes": [
    { "duct_identifier": "D1", "x": 50,  "y": 1900, "z": 300 },
    { "duct_identifier": "D2", "x": 750, "y": 1900, "z": 300 }
  ],
  "duct_segments": [
    { "source": "D1", "destination": "D2", "width": 60, "height": 60, "direction": "bidirectional" }
  ]
}
```

## Validation rules (enforced server-side, also available as a dry-run)

| Check | Level |
|---|---|
| `package_type` / `spec_version` / `units: "mm"` | error |
| `project_code` + `frame_id` match the import target | error |
| Panel dimensions present, 0 < value ≤ 20 000 mm | error |
| ≥ 1 device; ≤ 2000 devices; ≤ 500 terminals/device | error |
| Duplicate device tags / duplicate terminals per device | error |
| Finite numeric coordinates everywhere | error |
| Duct segment referencing an unknown node, or self-loop | error |
| Device x outside panel envelope | warning |
| Duct nodes without segments / disconnected duct graph | warning |
| Schedule matching report (matched/unmatched `DEVICE:TERMINAL` ends) | informational |

## What each mode requires

| Twin capability | Requires |
|---|---|
| Flat 3D plan view | published model with device + terminal geometry |
| Endpoint Guidance | both ends of the cable matched to terminals |
| Calculated Guidance Route | endpoint match **+** connected duct graph (A* through duct segments) |
| Approved Exact Route | a `cable_route_mappings` row (`wiring_row_id = "<frameId>#<sno>"`) with `approval_status = approved` |
| Engineering 3D | uploaded structured model file (STEP/IFC/glTF) — separate upload flow |

Sample package: `docs/samples/engineering-package.sample.json`
(fictitious geometry for format reference only — never import it into a production panel).
