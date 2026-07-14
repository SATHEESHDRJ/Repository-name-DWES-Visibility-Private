export interface SerializedHierarchyNode {
  expressID: number;
  type: string;
  children: SerializedHierarchyNode[];
}

export interface SerializedGeometry {
  id: number;
  positions: Float32Array;
  normals: Float32Array | null;
  indices: Uint32Array;
}

export interface SerializedStepFace {
  first: number;
  last: number;
  color: [number, number, number] | null;
}

export interface SerializedStepMesh extends SerializedGeometry {
  name: string;
  color: [number, number, number] | null;
  faces: SerializedStepFace[];
}

export interface SerializedStepNode {
  name: string;
  meshes: number[];
  children: SerializedStepNode[];
}

export interface SerializedStepModel {
  kind: 'step';
  unitLabel: string;
  root: SerializedStepNode;
  meshes: SerializedStepMesh[];
}

export interface SerializedIfcPlacement {
  geometryId: number;
  matrix: number[];
  color: [number, number, number, number];
}

export interface SerializedIfcComponent {
  expressID: number;
  name: string;
  type: string;
  placements: SerializedIfcPlacement[];
}

export interface SerializedIfcModel {
  kind: 'ifc';
  unitLabel: string;
  metersToSource: number;
  hierarchy: SerializedHierarchyNode | null;
  geometries: SerializedGeometry[];
  components: SerializedIfcComponent[];
}

export type SerializedEngineeringModel = SerializedStepModel | SerializedIfcModel;

export type ModelWorkerResponse =
  | { ok: true; model: SerializedEngineeringModel }
  | { ok: false; error: string };
