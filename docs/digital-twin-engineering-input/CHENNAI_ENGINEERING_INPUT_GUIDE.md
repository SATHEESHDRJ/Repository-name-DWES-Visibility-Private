# DWES Cable Digital Twin: Chennai Engineering Input Guide

This guide explains how to prepare and validate engineering data packages for the DWES Cable Digital Twin.

## 1. Why DWES Requires Structured Data

DWES provides technicians with precise "calculated guidance routes" or "approved exact routes" to wire switchgear panels. 
A flat 2D PDF drawing cannot be programmatically routed or intersected. A flat 3D CAD model (like STEP or IGES) provides geometry but lacks semantic intelligence (it does not know which box is "Device K1" or where "Terminal 14" physically sits).

Therefore, **Engineering 3D** requires:
1. The structured 3D geometry file (GLB/glTF or IFC).
2. A declarative mapping of devices and their precise terminal coordinates.
3. A topological graph of the cable ducts (nodes and segments).

## 2. Drawing Types

- **Approved 2D**: A standard GA PDF. DWES displays this as *Drawing Reference Only*.
- **Flat 3D**: A mechanical 3D model without semantic metadata.
- **Engineering 3D**: A structurally mapped model with exact coordinates, device aliases, and duct routing topologies. DWES uses this to generate *Calculated Guidance Routes*.

## 3. Coordinate Conventions

- **Measurement**: All coordinates must be measured in **millimetres (mm)** unless explicitly overridden in the manifest.
- **Origin (0,0,0)**: The recommended coordinate origin is the **bottom-left, front-most corner** of the main panel enclosure.
- **X-Axis**: Width (Left to Right).
- **Y-Axis**: Height (Bottom to Top).
- **Z-Axis**: Depth (Front to Back).

### Door-Mounted Devices
Devices mounted on the panel door should be modelled in their closed position relative to the main coordinate origin. Ensure their `z_mm` correctly reflects their protrusion relative to the origin.

### Terminals
Terminal coordinates must mark the exact physical point where the wire enters the device or terminal block.

### Cable Ducts
Ducts must be converted into a network graph:
- **Nodes**: Points where ducts start, end, branch, or turn.
- **Segments**: The straight sections of duct connecting two nodes.

## 4. Aliases and Approvals

Different departments sometimes use different naming conventions (e.g., "K1" vs "-K1"). 
Use the `device-aliases.csv` and `terminal-aliases.csv` to map Schedule References to Engineering References.
Fuzzy matching is strictly disabled in DWES; all aliases must be explicitly declared and approved.

## 5. Revisions and Packaging

All input packages must contain a specific `model_revision` that aligns with the `drawing_revision` and `schedule_revision`. 
If a physical component moves, a new revision package must be submitted.

### File Naming Standard
All files should follow the pattern:
`PROJECTCODE_PANEL_DRAWINGNUMBER_REVISION_ASSETTYPE.ext`

Example: `132KV33KV_KSA_RIYADH_2026_001_H001_GA001_R01_APPROVED_GA.pdf`

## 6. Package Validation

Before sending the package to the DWES Integration Team, you **must** run the offline validation script:
```bash
node scripts/digital-twin-input-validation/validate-package.mjs path/to/package
```
This script will immediately flag missing device references, disconnected ducts, duplicate terminals, or unsafe file references.

## 7. DWES Display States

If a panel package is incomplete, DWES will honestly degrade the classification:
- **Visualization Unavailable**: No data exists.
- **Drawing Reference Only**: Only a 2D PDF is available.
- **Endpoint Guidance**: Terminals are mapped, but no duct routes are defined.
- **Calculated Guidance Route**: Full Engineering 3D is available.
- **Approved Exact Route**: An explicit route override has been manually approved by an engineer.
