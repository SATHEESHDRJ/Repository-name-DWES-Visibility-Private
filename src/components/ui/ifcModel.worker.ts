import {
  IFCCONVERSIONBASEDUNIT,
  IFCPROJECT,
  IFCSIUNIT,
  IfcAPI,
  type FlatMesh,
} from 'web-ifc';
import webIfcWasmUrl from 'web-ifc/web-ifc.wasm?url';
import type {
  ModelWorkerResponse,
  SerializedGeometry,
  SerializedHierarchyNode,
  SerializedIfcComponent,
  SerializedIfcModel,
} from './engineeringModelLoaderTypes';

interface IfcRequest {
  buffer: ArrayBuffer;
}

interface IfcLengthUnit {
  label: string;
  scaleToMeters: number;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<IfcRequest>) => void) | null;
  postMessage: (message: ModelWorkerResponse, transfer?: Transferable[]) => void;
  close: () => void;
};

const prefixScale: Record<string, number> = {
  EXA: 1e18,
  PETA: 1e15,
  TERA: 1e12,
  GIGA: 1e9,
  MEGA: 1e6,
  KILO: 1e3,
  HECTO: 1e2,
  DECA: 10,
  DECI: 1e-1,
  CENTI: 1e-2,
  MILLI: 1e-3,
  MICRO: 1e-6,
  NANO: 1e-9,
  PICO: 1e-12,
  FEMTO: 1e-15,
  ATTO: 1e-18,
};

const prefixLabel: Record<string, string> = {
  KILO: 'km',
  CENTI: 'cm',
  MILLI: 'mm',
  MICRO: 'µm',
  NANO: 'nm',
};

function valueOf(value: any): any {
  return value && typeof value === 'object' && 'value' in value ? value.value : value;
}

function deleteVector(value: unknown) {
  (value as { delete?: () => void } | null)?.delete?.();
}

function unitFromLine(line: any): IfcLengthUnit | null {
  if (!line || String(valueOf(line.UnitType) || '').toUpperCase() !== 'LENGTHUNIT') return null;
  if (line.type === IFCSIUNIT) {
    const prefix = String(valueOf(line.Prefix) || '').toUpperCase();
    const scaleToMeters = prefix ? prefixScale[prefix] : 1;
    return {
      scaleToMeters: Number.isFinite(scaleToMeters) ? scaleToMeters : 1,
      label: prefix ? prefixLabel[prefix] || `${prefix.toLowerCase()}m` : 'm',
    };
  }
  if (line.type === IFCCONVERSIONBASEDUNIT) {
    const unitName = String(valueOf(line.Name) || 'model unit').trim();
    const conversion = line.ConversionFactor;
    const magnitude = Number(valueOf(conversion?.ValueComponent));
    const base = unitFromLine(conversion?.UnitComponent) || { label: 'm', scaleToMeters: 1 };
    const normalizedName = unitName.toUpperCase().replace(/[\s_-]+/g, '');
    const label = normalizedName === 'INCH' || normalizedName === 'INCHES'
      ? 'in'
      : normalizedName === 'FOOT' || normalizedName === 'FEET'
        ? 'ft'
        : unitName;
    return {
      label,
      scaleToMeters: Number.isFinite(magnitude) && magnitude > 0 ? magnitude * base.scaleToMeters : base.scaleToMeters,
    };
  }
  return null;
}

function modelLengthUnit(api: IfcAPI, modelID: number): IfcLengthUnit {
  const projects = api.GetLineIDsWithType(modelID, IFCPROJECT);
  try {
    if (!projects.size()) return { label: 'm', scaleToMeters: 1 };
    const project = api.GetLine(modelID, projects.get(0));
    const assignmentID = Number(valueOf(project?.UnitsInContext));
    if (!assignmentID) return { label: 'm', scaleToMeters: 1 };
    const assignment = api.GetLine(modelID, assignmentID);
    for (const handle of assignment?.Units || []) {
      const unitID = Number(valueOf(handle));
      if (!unitID) continue;
      const result = unitFromLine(api.GetLine(modelID, unitID, true));
      if (result) return result;
    }
    return { label: 'm', scaleToMeters: 1 };
  } finally {
    deleteVector(projects);
  }
}

function componentLabel(api: IfcAPI, modelID: number, expressID: number) {
  try {
    const line = api.GetLine(modelID, expressID);
    const type = api.GetNameFromTypeCode(line?.type || api.GetLineType(modelID, expressID)) || 'IFC component';
    const name = String(valueOf(line?.Name) || valueOf(line?.LongName) || '').trim();
    return { type, name: name ? `${name} · ${type}` : `${type} #${expressID}` };
  } catch {
    return { type: 'IFC component', name: `IFC component #${expressID}` };
  }
}

function serializeGeometry(api: IfcAPI, modelID: number, geometryExpressID: number): SerializedGeometry {
  const geometry = api.GetGeometry(modelID, geometryExpressID);
  try {
    const vertexData = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
    const vertexCount = Math.floor(vertexData.length / 6);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    for (let source = 0, target = 0; target < positions.length; source += 6, target += 3) {
      positions[target] = vertexData[source];
      positions[target + 1] = vertexData[source + 1];
      positions[target + 2] = vertexData[source + 2];
      normals[target] = vertexData[source + 3];
      normals[target + 1] = vertexData[source + 4];
      normals[target + 2] = vertexData[source + 5];
    }
    const indices = new Uint32Array(api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize()));
    return { id: geometryExpressID, positions, normals, indices };
  } finally {
    geometry.delete();
  }
}

function serializeFlatMesh(
  api: IfcAPI,
  modelID: number,
  flatMesh: FlatMesh,
  geometries: Map<number, SerializedGeometry>,
): SerializedIfcComponent {
  try {
    const label = componentLabel(api, modelID, flatMesh.expressID);
    const placements = [] as SerializedIfcComponent['placements'];
    for (let index = 0; index < flatMesh.geometries.size(); index += 1) {
      const placed = flatMesh.geometries.get(index);
      if (!geometries.has(placed.geometryExpressID)) {
        geometries.set(placed.geometryExpressID, serializeGeometry(api, modelID, placed.geometryExpressID));
      }
      placements.push({
        geometryId: placed.geometryExpressID,
        matrix: Array.from(placed.flatTransformation, Number),
        color: [Number(placed.color.x), Number(placed.color.y), Number(placed.color.z), Number(placed.color.w)],
      });
    }
    return { expressID: flatMesh.expressID, name: label.name, type: label.type, placements };
  } finally {
    // Current web-ifc browser/node builds do not consistently expose the
    // `delete` method declared on FlatMesh. CloseModel/Dispose owns that WASM
    // allocation; call delete only when the concrete build provides it.
    (flatMesh as FlatMesh & { delete?: () => void }).delete?.();
  }
}

function normalizeHierarchy(node: any): SerializedHierarchyNode {
  return {
    expressID: Number(node?.expressID) || 0,
    type: String(node?.type || 'IFC group'),
    children: Array.isArray(node?.children) ? node.children.map(normalizeHierarchy) : [],
  };
}

scope.onmessage = async event => {
  const api = new IfcAPI();
  let modelID = -1;
  let initialized = false;
  try {
    await api.Init(path => path.endsWith('.wasm') ? webIfcWasmUrl : path, true);
    initialized = true;
    modelID = api.OpenModel(new Uint8Array(event.data.buffer), { COORDINATE_TO_ORIGIN: false });
    if (modelID < 0 || !api.IsModelOpen(modelID)) throw new Error('The IFC parser could not open this model.');

    const unit = modelLengthUnit(api, modelID);
    const geometries = new Map<number, SerializedGeometry>();
    const components: SerializedIfcComponent[] = [];
    api.StreamAllMeshes(modelID, flatMesh => {
      const component = serializeFlatMesh(api, modelID, flatMesh, geometries);
      if (component.placements.length) components.push(component);
    });
    if (!components.length || !geometries.size) throw new Error('The IFC model does not contain renderable geometry.');

    let hierarchy: SerializedHierarchyNode | null = null;
    try {
      hierarchy = normalizeHierarchy(await api.properties.getSpatialStructure(modelID, false));
    } catch {
      // Geometry remains usable even when an incomplete IFC omits spatial relations.
    }

    const model: SerializedIfcModel = {
      kind: 'ifc',
      unitLabel: unit.label,
      metersToSource: unit.scaleToMeters > 0 ? 1 / unit.scaleToMeters : 1,
      hierarchy,
      geometries: Array.from(geometries.values()),
      components,
    };
    const transfer: Transferable[] = [];
    model.geometries.forEach(geometry => {
      transfer.push(geometry.positions.buffer, geometry.indices.buffer);
      if (geometry.normals) transfer.push(geometry.normals.buffer);
    });
    scope.postMessage({ ok: true, model }, transfer);
  } catch (error) {
    scope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to parse this IFC model.',
    });
  } finally {
    if (initialized) {
      try {
        if (modelID >= 0 && api.IsModelOpen(modelID)) api.CloseModel(modelID);
      } finally {
        api.Dispose();
      }
    }
    scope.close();
  }
};
