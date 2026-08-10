# DWES Live 3D Operational Twin — Phase 2 Report

**Date:** 2026-07-17  
**Status:** COMPLETE  
**Scope:** Backend 3D Payload Service (CP21)

---

## Objective

Implement the backend service that generates a procedural 3D payload from GA asset sets, confirmed device/terminal mapping, and cable correlation data.

---

## Deliverables

### 1. operational-twin-3d.service.ts

- **Release gate:** technicians blocked if no confirmed ga_asset_sets row (HTTP 403).
- Fetches ga_asset_sets, ga_faces, device_geometries, terminal_geometries, ga_correlation_results.
- **Legacy fallback:** returns payload with legacy:true if no GA Asset Set exists (non-technician).
- Builds Ot3dFace[], Ot3dDevice[], resolves activeWire via ga_correlation_results.

### 2. normalizedFaceToMm() — Coordinate Conversion

| Face | X | Y | Z |
|------|---|---|---|
| front/custom | 0 to W | 0 to H (flip) | 0 |
| rear | 0 to W (mirror) | 0 to H | panelD |
| internal | 0 to W | 0 to H | panelD x 0.1 |

sceneScale = 0.001 (mm to Three.js world units).

### 3. Route Labels

| Condition | Label |
|-----------|-------|
| Confirmed mapping + approved route nodes | Approved Exact Route |
| Confirmed mapping, no route nodes | Calculated Guidance |
| Partial mapping | Endpoint Guidance |
| No confirmed mapping | Route Not Mapped |

### 4. Module Registration

- OperationalTwin3dService registered in EngineeringModule providers and exports.
- GET endpoint /engineering/operational-twin-3d/:projectCode/:frameId added.

---

## Tests

backend/test/operational-twin-3d.test.cjs  10 pass / 0 fail

Test coverage: normalizedFaceToMm for all face types, SCENE_SCALE, centring, payload shape.

---

## Build Result

npm run build (backend)  EXIT 0
nest build               PASS