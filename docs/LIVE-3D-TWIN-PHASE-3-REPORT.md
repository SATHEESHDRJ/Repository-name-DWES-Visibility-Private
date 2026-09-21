# DWES Live 3D Operational Twin — Phase 3 Report

**Date:** 2026-07-17  
**Status:** COMPLETE  
**Scope:** Frontend Utilities + OperationalTwin3D Component (CP22, CP23)

---

## Objective

Build the coordinate-conversion utilities, wire-state derivation utilities, and the React Three Fiber
OperationalTwin3D component that renders the live 3D panel enclosure with wiring overlays.

---

## Deliverables

### 1. src/utils/operationalTwin3dCoords.ts

| Export | Purpose |
|--------|---------|
| SCENE_SCALE | 0.001 mm to Three.js world unit scalar |
| mmToWorld(mm, panelMm) | Panel-local mm to centred Three.js world coordinate |
| doorHingePosition(panelMm) | Left-edge front-face hinge in world units |
| doorRotationY(open) | Door Y-rotation (0 closed, -DOOR_OPEN_ANGLE_RAD open) |
| cameraFitPosition(panelMm) | Isometric fit position from panel diagonal |
| cameraFrontPosition / cameraRearPosition | Named camera presets |
| prefersReducedMotion() | Reads prefers-reduced-motion media query |

### 2. src/utils/operationalTwin3dWireState.ts

| Export | Purpose |
|--------|---------|
| WireVisualState | pending, in_progress, completed, issue |
| WireLayerFilter | all, completed, pending, issues, my_wires |
| WIRE_STATE_COLORS | Color constants for each wire state |
| ENDPOINT_COLORS | src/dst endpoint dot colors |
| deriveWireVisualState(sno, status) | Computes visual state from ExtendedCableStatus |
| passesLayerFilter(sno, state, status, filter, userId) | Layer visibility predicate |
| resolveCompletionState(status) | show/rework/state flags for layer rendering |
| buildWireStateMap(statusesBySno) | Builds full sno->WireVisualState map |

### 3. src/types/ot3d.ts — Shared Frontend Types

Mirrors backend interfaces (Ot3dPayload, Ot3dDevice, Ot3dTerminal, Ot3dFace, Ot3dWireState,
Ot3dEndpointMapping, Ot3dRouteLabel, SCENE_SCALE) without importing any backend source.

### 4. src/components/technician/wiring/OperationalTwin3D.tsx

React Three Fiber component using @react-three/fiber + @react-three/drei.

| Feature | Implementation |
|---------|----------------|
| Panel shell | BoxGeometry H x W x D (world units), MeshStandardMaterial |
| Panel edges | EdgesGeometry over shell |
| Door | Animated BoxGeometry on left hinge, reduced-motion aware |
| GA face planes | PlaneGeometry textured from gaApi.faceImage() blobs |
| Device meshes | BoxGeometry per device with Html label |
| Terminal points | SphereGeometry per terminal |
| Active wire | Amber animated Line + route/guidance nodes |
| Completed wires | Solid Lines using WIRE_STATE_COLORS |
| Camera presets | fit, front, internal, rear via cameraFitPosition/cameraFrontPosition/cameraRearPosition |
| frameloop | demand (tablet performance) |
| readOnly prop | Disables door toggle button for supervisor/QA/QC |
| Route quality | Label displayed in overlay |
| Error/loading states | Inline Html fallback within Canvas |

Never mutates wiring state — read-only access to wireStatusesBySno.

---

## Tests

tests/operational-twin-3d.test.ts  26 pass / 0 fail

Coverage: SCENE_SCALE, mmToWorld, doorHingePosition, doorRotationY, cameraFitPosition,
deriveWireVisualState (all states), passesLayerFilter (all filters), resolveCompletionState,
buildWireStateMap, WIRE_STATE_COLORS.

---

## Build Result

npm run typecheck  EXIT 0  (0 new errors)
npm run build      EXIT 0  (OperationalTwin3D lazy chunk: 6.42 kB)