# Operational 2D Twin — data model & CAD licence gate

**Date:** 2026-07-16  
**Scope:** Technician 2D Operational Digital Twin (Mode A GEOMETRY / Mode B SCHEMATIC)

## Drawing-mode decision

1. **GEOMETRY** — only when an approved + published `panel_models` row exists **and** device + terminal geometries are present.
2. **SCHEMATIC (Mode B)** — mandatory fallback for PDF-only drawings, unsupported DWG, failed/unavailable CAD parse, incomplete geometry, or missing coordinates.
3. Wiring workflow is **never blocked** when geometry is unavailable.

## Schematic terminal IDs (generation v2)

Terminal ids use `term:{normalizedDeviceTag}::{normalizedTerminal}` so nested tags cannot collide (e.g. device `87BB` + terminal `X102:2` vs device `87BB:X102` + terminal `2`). Bump `SCHEMATIC_GENERATION_VERSION` when the algorithm changes so `TwinLayoutStore` regenerates cached `*.schematic.json`.

## Conceptual Twin* models → DWES persistence

| Prompt concept | DWES implementation | Notes |
|----------------|---------------------|-------|
| `TwinPanelLayout` | `uploads/<PROJECT>/twin-layouts/<frameId>.schematic.json` (Mode B) + published `panel_models` (Mode A) | File store mirrors frames/drawings pattern |
| `TwinDevice` | Schematic JSON `devices[]` **or** `device_geometries` | No duplicate wire-status field |
| `TwinTerminal` | Schematic JSON `terminals[]` **or** `terminal_geometries` | |
| `TwinDuctSegment` | Schematic lane `ductSegments[]` **or** `duct_nodes`/`duct_segments` | Schematic lanes are guidance only (`approved: false`) |
| Wiring-row links | `wires[].sourceTwinTerminalId` / `destinationTwinTerminalId` + classification | Authoritative cable status remains assignment `cable_status` |

### Why no WiringSchemeDB DDL

`dwes-db-guard` forbids `prisma migrate` / DDL against WiringSchemeDB. Existing geometry tables already cover Mode A. Mode B layouts persist as JSON under `uploads/` (same family as frames). A formal Prisma migration for Twin* tables is **not applied**; this document is the mapping contract.

## CAD dependency + licence review

| Item | Result |
|------|--------|
| Direct CAD parser deps (dxf/dwg/mlightcad/konva) | **None added** |
| `react-konva` | **Not added** — SVG reused (`FlatPanelView` pattern) |
| Autodesk APS/Forge / cloud CAD | **Not used** |
| GPL converters | **Not bundled** |
| Vue CAD embedded in React | **Not used** |
| Capability flag | `DWES_CAD_GEOMETRY_ENABLED` (default `false`) |
| Adapter | `CadGeometryAdapter` + `DisabledCadGeometryAdapter` in `backend/src/engineering/cad-geometry-adapter.ts` |

**Verdict:** Mode A remains behind a disabled capability flag with clear diagnostics. Mode B is complete and always available.

## API

- `GET /api/engineering/operational-twin/:projectCode/:frameId?cableRef=`
- Roles: same as twin-context (technician + supervisor + QA/QC + ops director + system admin)
- Reuses JWT + existing RBAC; does not alter Start/Pause/Skip/Complete transactions or SSE channels

## Route classification (2D honest labels)

- **Approved Exact Route** — published approved route + mapped terminals  
- **Calculated Guidance** — deterministic lane/duct routing (clearly guidance)  
- **Endpoint Guidance** — mapped endpoints, no reliable route geometry  
- **Route Not Mapped** — insufficient endpoints  

Never: Excel schematic as exact physical route; PDF background as structured geometry; decorative straight line as Calculated Guidance when endpoints are unmapped.
