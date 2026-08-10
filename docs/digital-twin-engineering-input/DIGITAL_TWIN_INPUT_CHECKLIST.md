# Digital Twin Input Checklist

This checklist must be followed when constructing a Digital Twin input package.

## Mandatory Requirements

The package will be rejected by the validation script if any of these are missing or invalid:

- [ ] **Approved GA drawing**: The authoritative 2D visual reference.
- [ ] **Drawing number and revision**: Must match the DWES project records.
- [ ] **Schedule revision**: Must correspond to the exact wiring schedule being routed.
- [ ] **Panel dimensions**: Accurate bounding box dimensions (W/H/D) in `panel-metadata.csv`.
- [ ] **Device tags**: Unique identifiers in `device-geometry.csv`.
- [ ] **Device coordinates**: Valid numeric X/Y/Z coordinates within panel bounds.
- [ ] **Terminal references**: Unique identifiers for each connection point on a device.
- [ ] **Terminal coordinates**: Valid numeric X/Y/Z coordinates for the precise wiring entry point.
- [ ] **Duct nodes**: Routing graph vertices defined in `duct-nodes.csv`.
- [ ] **Duct segments**: Valid connections between nodes without self-intersections or orphans.
- [ ] **Engineering approval information**: Metadata detailing who prepared, checked, and approved the routing package.

## Recommended Inclusions

These assets significantly improve the Digital Twin experience:

- [ ] **DWG or DXF**: 2D CAD extracts for precise high-resolution zoom.
- [ ] **STEP or IFC**: High-fidelity engineering 3D geometry.
- [ ] **GLB or glTF**: Optimized web-ready 3D models for immediate rendering.
- [ ] **Device catalogue dimensions**: Accurate bounding boxes for collision detection.
- [ ] **Terminal orientation**: The specific angle/direction a wire must approach the terminal.
- [ ] **Cable duct capacity**: Maximum fill ratio restrictions for automated routing calculations.
- [ ] **Approved aliases**: Verified mappings in `device-aliases.csv` to resolve schedule/engineering mismatches.

## Optional Inclusions

These elements provide visual polish but are not strictly required for routing:

- [ ] **Textures**: Realistic materials for enclosures and devices.
- [ ] **Manufacturer 3D models**: High-detail component assets supplied by the OEM.
- [ ] **Door animation**: Kinematic definitions allowing the panel door to swing open.
- [ ] **High-detail component models**: Detailed sub-components for complex switchgear.
- [ ] **Exact bend radii**: Minimum bending limitations for thick power cables.
- [ ] **Installation photographs**: Real-world visual references of the assembled panel.
