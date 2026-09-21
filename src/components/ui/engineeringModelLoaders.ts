import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
} from 'three';
import type {
  ModelWorkerResponse,
  SerializedEngineeringModel,
  SerializedGeometry,
  SerializedHierarchyNode,
  SerializedIfcModel,
  SerializedStepMesh,
  SerializedStepModel,
  SerializedStepNode,
} from './engineeringModelLoaderTypes';

export interface LoadedEngineeringModel {
  root: Object3D;
  unitLabel: string;
}

type BrowserCadFormat = 'step' | 'stp' | 'ifc';

function workerModel(
  worker: Worker,
  buffer: ArrayBuffer,
  signal?: AbortSignal,
): Promise<SerializedEngineeringModel> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      worker.terminate();
      reject(new DOMException('Model loading was cancelled.', 'AbortError'));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });

    worker.onmessage = (event: MessageEvent<ModelWorkerResponse>) => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (event.data.ok) resolve(event.data.model);
      else reject(new Error(event.data.error));
    };
    worker.onerror = event => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      reject(new Error(event.message || 'The browser model parser failed.'));
    };
    worker.postMessage({ buffer }, [buffer]);
  });
}

function geometryFrom(serialized: SerializedGeometry) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(serialized.positions, 3));
  if (serialized.normals?.length === serialized.positions.length) {
    geometry.setAttribute('normal', new BufferAttribute(serialized.normals, 3));
  }
  geometry.setIndex(new BufferAttribute(serialized.indices, 1));
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function cadMaterial(color: [number, number, number] | null, opacity = 1) {
  const resolved = color ? new Color(color[0], color[1], color[2]) : new Color('#8aa4c4');
  return new MeshStandardMaterial({
    color: resolved,
    metalness: .12,
    roughness: .66,
    opacity,
    transparent: opacity < .999,
    depthWrite: opacity >= .999,
  });
}

function buildStepMesh(serialized: SerializedStepMesh) {
  const geometry = geometryFrom(serialized);
  const materials: MeshStandardMaterial[] = [cadMaterial(serialized.color)];
  serialized.faces.forEach(face => {
    if (face.last < face.first) return;
    const materialIndex = face.color ? materials.push(cadMaterial(face.color)) - 1 : 0;
    geometry.addGroup(face.first * 3, (face.last - face.first + 1) * 3, materialIndex);
  });
  const mesh = new Mesh(geometry, materials.length === 1 ? materials[0] : materials);
  mesh.name = serialized.name;
  mesh.userData.sourceMeshId = serialized.id;
  return mesh;
}

function stepMeshInstance(mesh: Mesh) {
  const instance = mesh.clone();
  instance.material = Array.isArray(mesh.material)
    ? mesh.material.map(material => material.clone())
    : mesh.material.clone();
  return instance;
}

function buildStepNode(node: SerializedStepNode, meshes: Map<number, Mesh>, used: Set<number>): Group {
  const group = new Group();
  group.name = node.name;
  node.meshes.forEach(id => {
    const mesh = meshes.get(id);
    // STEP assembly nodes can instance the same part more than once. A Three
    // object may only have one parent, so retain shared immutable geometry and
    // material resources while creating an Object3D instance for each use.
    if (mesh) {
      used.add(id);
      group.add(stepMeshInstance(mesh));
    }
  });
  node.children.forEach(child => group.add(buildStepNode(child, meshes, used)));
  return group;
}

function buildStepModel(model: SerializedStepModel): LoadedEngineeringModel {
  const meshes = new Map(model.meshes.map(mesh => [mesh.id, buildStepMesh(mesh)]));
  const used = new Set<number>();
  const root = buildStepNode(model.root, meshes, used);
  const unassigned = new Group();
  unassigned.name = 'Other STEP components';
  meshes.forEach((mesh, id) => {
    if (!used.has(id)) unassigned.add(stepMeshInstance(mesh));
    const prototypeMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    prototypeMaterials.forEach(material => material.dispose());
  });
  if (unassigned.children.length) root.add(unassigned);
  root.name ||= 'STEP assembly';
  root.userData.measurementUnit = model.unitLabel;
  return { root, unitLabel: model.unitLabel };
}

function ifcMaterial(color: [number, number, number, number]) {
  const opacity = Math.min(1, Math.max(0, color[3]));
  return new MeshStandardMaterial({
    color: new Color(color[0], color[1], color[2]),
    metalness: .03,
    roughness: .72,
    opacity,
    transparent: opacity < .999,
    depthWrite: opacity >= .999,
  });
}

function hierarchyLabel(node: SerializedHierarchyNode) {
  return node.type ? `${node.type} #${node.expressID}` : `IFC group #${node.expressID}`;
}

function buildIfcModel(model: SerializedIfcModel): LoadedEngineeringModel {
  const geometries = new Map<number, BufferGeometry>(model.geometries.map(item => [item.id, geometryFrom(item)]));
  const components = new Map<number, Group>();
  model.components.forEach(component => {
    const group = new Group();
    group.name = component.name;
    group.userData.ifcExpressID = component.expressID;
    group.userData.ifcType = component.type;
    component.placements.forEach((placement, index) => {
      const geometry = geometries.get(placement.geometryId);
      if (!geometry) return;
      const mesh = new Mesh(geometry, ifcMaterial(placement.color));
      mesh.name = component.placements.length > 1 ? `${component.name} · part ${index + 1}` : component.name;
      mesh.userData.ifcExpressID = component.expressID;
      mesh.matrix.fromArray(placement.matrix);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    });
    components.set(component.expressID, group);
  });

  const attached = new Set<number>();
  const convert = (node: SerializedHierarchyNode): Group => {
    const group = new Group();
    const component = components.get(node.expressID);
    group.name = component?.name || hierarchyLabel(node);
    group.userData.ifcExpressID = node.expressID;
    group.userData.ifcType = node.type;
    if (component) {
      while (component.children.length) group.add(component.children[0]);
      attached.add(node.expressID);
    }
    node.children.forEach(child => group.add(convert(child)));
    return group;
  };

  const root = model.hierarchy ? convert(model.hierarchy) : new Group();
  root.name ||= 'IFC model';
  const unassigned = new Group();
  unassigned.name = 'Other IFC components';
  components.forEach((component, expressID) => {
    if (!attached.has(expressID)) unassigned.add(component);
  });
  if (unassigned.children.length) root.add(unassigned);

  // web-ifc intentionally emits metre-scaled geometry. Restore the declared
  // source unit so the existing point-to-point measurement tool reports the
  // same numerical dimensions as the engineering model.
  root.scale.setScalar(model.metersToSource);
  root.userData.measurementUnit = model.unitLabel;
  return { root, unitLabel: model.unitLabel };
}

export async function loadEngineeringSourceModel(
  blob: Blob,
  format: BrowserCadFormat,
  signal?: AbortSignal,
): Promise<LoadedEngineeringModel> {
  const buffer = await blob.arrayBuffer();
  if (signal?.aborted) throw new DOMException('Model loading was cancelled.', 'AbortError');
  const worker = format === 'ifc'
    ? new Worker(new URL('./ifcModel.worker.ts', import.meta.url), { type: 'module', name: 'dwes-ifc-loader' })
    : new Worker(new URL('./stepModel.worker.ts', import.meta.url), { type: 'module', name: 'dwes-step-loader' });
  const serialized = await workerModel(worker, buffer, signal);
  return serialized.kind === 'ifc' ? buildIfcModel(serialized) : buildStepModel(serialized);
}

export function disposeEngineeringModel(root: Object3D | null) {
  if (!root) return;
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse(child => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.filter(Boolean).forEach(material => materials.add(material));
  });
  materials.forEach(material => {
    Object.values(material).forEach(value => {
      if (value instanceof Texture) textures.add(value);
    });
  });
  geometries.forEach(geometry => geometry.dispose());
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  root.clear();
}
