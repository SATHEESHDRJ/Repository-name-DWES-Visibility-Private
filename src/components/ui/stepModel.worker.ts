// occt-import-js ships browser JavaScript and WASM but no TypeScript declaration.
// @ts-expect-error -- the runtime package is intentionally loaded only in this worker.
import createOcct from 'occt-import-js';
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';
import type {
  ModelWorkerResponse,
  SerializedStepFace,
  SerializedStepMesh,
  SerializedStepModel,
  SerializedStepNode,
} from './engineeringModelLoaderTypes';

interface OcctNode {
  name?: string;
  meshes?: number[];
  children?: OcctNode[];
}

interface OcctMesh {
  name?: string;
  color?: number[];
  brep_faces?: Array<{ first: number; last: number; color?: number[] | null }>;
  attributes?: {
    position?: { array?: number[] };
    normal?: { array?: number[] };
  };
  index?: { array?: number[] };
}

interface OcctResult {
  success: boolean;
  root?: OcctNode;
  meshes?: OcctMesh[];
}

interface StepRequest {
  buffer: ArrayBuffer;
}

type StepUnit = 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<StepRequest>) => void) | null;
  postMessage: (message: ModelWorkerResponse, transfer?: Transferable[]) => void;
  close: () => void;
};

function sourceStepUnit(bytes: Uint8Array): { parserUnit: StepUnit; label: string } {
  // STEP unit assignments normally occur near the start. Read enough for large
  // headers without duplicating an entire engineering model as a JS string.
  const text = new TextDecoder('latin1')
    .decode(bytes.subarray(0, Math.min(bytes.byteLength, 2 * 1024 * 1024)))
    .toUpperCase();
  const lengthStatements = text.match(/#\d+\s*=\s*\([^;]*LENGTH_UNIT\s*\(\s*\)[^;]*\);/gs) || [];

  for (const statement of lengthStatements) {
    const converted = statement.match(/CONVERSION_BASED_UNIT\s*\(\s*'([^']+)'/);
    const name = converted?.[1]?.replace(/[\s_-]+/g, '');
    if (name === 'INCH' || name === 'INCHES') return { parserUnit: 'inch', label: 'in' };
    if (name === 'FOOT' || name === 'FEET') return { parserUnit: 'foot', label: 'ft' };
    if (name === 'MILLIMETRE' || name === 'MILLIMETER') return { parserUnit: 'millimeter', label: 'mm' };
    if (name === 'CENTIMETRE' || name === 'CENTIMETER') return { parserUnit: 'centimeter', label: 'cm' };

    const si = statement.match(/SI_UNIT\s*\(\s*(\$|\.[A-Z]+\.)\s*,\s*\.METRE\.\s*\)/);
    if (!si) continue;
    if (si[1] === '.MILLI.') return { parserUnit: 'millimeter', label: 'mm' };
    if (si[1] === '.CENTI.') return { parserUnit: 'centimeter', label: 'cm' };
    if (si[1] === '$') return { parserUnit: 'meter', label: 'm' };
  }

  // OCCT always converts source units accurately to the requested output unit.
  // Millimetres are its documented default when the source declaration cannot
  // be represented by the five output-unit choices exposed by this build.
  return { parserUnit: 'millimeter', label: 'mm' };
}

function rgb(value?: number[] | null): [number, number, number] | null {
  return value && value.length >= 3 ? [Number(value[0]), Number(value[1]), Number(value[2])] : null;
}

function serializeNode(node: OcctNode): SerializedStepNode {
  return {
    name: node.name?.trim() || 'STEP assembly',
    meshes: Array.isArray(node.meshes) ? node.meshes.map(Number) : [],
    children: Array.isArray(node.children) ? node.children.map(serializeNode) : [],
  };
}

function serializeMesh(mesh: OcctMesh, id: number): SerializedStepMesh {
  const positions = new Float32Array(mesh.attributes?.position?.array || []);
  const normalValues = mesh.attributes?.normal?.array;
  const normals = normalValues?.length === positions.length ? new Float32Array(normalValues) : null;
  const indices = new Uint32Array(mesh.index?.array || []);
  const faces: SerializedStepFace[] = (mesh.brep_faces || []).map(face => ({
    first: Number(face.first),
    last: Number(face.last),
    color: rgb(face.color),
  }));
  return {
    id,
    name: mesh.name?.trim() || `STEP component ${id + 1}`,
    color: rgb(mesh.color),
    faces,
    positions,
    normals,
    indices,
  };
}

scope.onmessage = async event => {
  try {
    const bytes = new Uint8Array(event.data.buffer);
    const unit = sourceStepUnit(bytes);
    const occt = await createOcct({
      locateFile: (path: string) => path.endsWith('.wasm') ? occtWasmUrl : path,
    });
    const result = occt.ReadStepFile(bytes, { linearUnit: unit.parserUnit }) as OcctResult;
    if (!result.success || !result.root || !result.meshes?.length) {
      throw new Error('The STEP parser did not return usable model geometry.');
    }

    const model: SerializedStepModel = {
      kind: 'step',
      unitLabel: unit.label,
      root: serializeNode(result.root),
      meshes: result.meshes.map(serializeMesh),
    };
    const transfer: Transferable[] = [];
    model.meshes.forEach(mesh => {
      transfer.push(mesh.positions.buffer, mesh.indices.buffer);
      if (mesh.normals) transfer.push(mesh.normals.buffer);
    });
    scope.postMessage({ ok: true, model }, transfer);
  } catch (error) {
    scope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to parse this STEP model.',
    });
  } finally {
    // Each import gets a fresh worker. Closing it releases the OCCT WASM heap.
    scope.close();
  }
};
