import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from 'react';
import {
  Box3,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Plane,
  Vector3,
  type Group,
} from 'three';
import { Canvas, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  Bounds,
  Center,
  Environment,
  Html,
  Line,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  useBounds,
  useGLTF,
} from '@react-three/drei';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { disposeEngineeringModel, loadEngineeringSourceModel } from './engineeringModelLoaders';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Maximize,
  RefreshCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from './icons';
import { DwesGaViewerLoading, DwesLoadingIndicator } from './DwesLoadingIndicator';

export type EngineeringModelFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'fbx' | 'step' | 'stp' | 'ifc';
type Projection = 'perspective' | 'orthographic';
type ViewName = 'iso' | 'front' | 'top' | 'side';
type SectionAxis = 'x' | 'y' | 'z';

interface TreeNode {
  uuid: string;
  label: string;
  kind: string;
  children: TreeNode[];
}

interface ModelCommand {
  type: 'zoom-in' | 'zoom-out' | 'fit' | 'reset' | 'rotate' | 'view';
  seq: number;
  view?: ViewName;
}

interface Measurement {
  start: Vector3;
  end: Vector3;
}

interface EngineeringModelViewerProps {
  blob: Blob;
  fileName: string;
  format: string;
  readOnly?: boolean;
  className?: string;
}

class ModelErrorBoundary extends Component<{
  children: ReactNode;
  onError: () => void;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const viewDirections: Record<ViewName, Vector3> = {
  iso: new Vector3(1, .8, 1),
  front: new Vector3(0, 0, 1),
  top: new Vector3(0, 1, 0),
  side: new Vector3(1, 0, 0),
};

function cloneMaterials(root: Object3D) {
  root.traverse(child => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(material => material.clone())
      : mesh.material.clone();
  });
  return root;
}

function GlTfModel({ url, onReady }: { url: string; onReady: (root: Object3D) => void }) {
  const gltf = useGLTF(url);
  const object = useMemo(() => cloneMaterials(gltf.scene.clone(true)), [gltf.scene]);
  useEffect(() => {
    onReady(object);
    return () => disposeEngineeringModel(object);
  }, [object, onReady]);
  return <primitive object={object} />;
}

function ObjModel({ url, onReady }: { url: string; onReady: (root: Object3D) => void }) {
  const source = useLoader(OBJLoader, url);
  const object = useMemo(() => cloneMaterials(source.clone(true)), [source]);
  useEffect(() => {
    onReady(object);
    return () => disposeEngineeringModel(object);
  }, [object, onReady]);
  return <primitive object={object} />;
}

function FbxModel({ url, onReady }: { url: string; onReady: (root: Object3D) => void }) {
  const source = useLoader(FBXLoader, url);
  const object = useMemo(() => cloneMaterials(source.clone(true)), [source]);
  useEffect(() => {
    onReady(object);
    return () => disposeEngineeringModel(object);
  }, [object, onReady]);
  return <primitive object={object} />;
}

function StlModel({ url, onReady }: { url: string; onReady: (root: Object3D) => void }) {
  const geometry = useLoader(STLLoader, url);
  const object = useMemo(() => {
    const mesh = new Mesh(
      geometry.clone(),
      new MeshStandardMaterial({ color: '#8aa4c4', metalness: .18, roughness: .62 }),
    );
    mesh.name = 'STL model';
    return mesh;
  }, [geometry]);
  useEffect(() => {
    onReady(object);
    return () => disposeEngineeringModel(object);
  }, [object, onReady]);
  return <primitive object={object} />;
}

function ParsedModel({ object, onReady }: { object: Object3D; onReady: (root: Object3D) => void }) {
  useEffect(() => { onReady(object); }, [object, onReady]);
  return <primitive object={object} />;
}

function ModelAsset({
  url,
  object,
  format,
  onReady,
}: {
  url: string;
  object: Object3D | null;
  format: EngineeringModelFormat;
  onReady: (root: Object3D) => void;
}) {
  if (object) return <ParsedModel object={object} onReady={onReady} />;
  if (!url) return null;
  if (format === 'obj') return <ObjModel url={url} onReady={onReady} />;
  if (format === 'stl') return <StlModel url={url} onReady={onReady} />;
  if (format === 'fbx') return <FbxModel url={url} onReady={onReady} />;
  return <GlTfModel url={url} onReady={onReady} />;
}

function materialsOf(object: Object3D): Material[] {
  const mesh = object as Mesh;
  if (!mesh.isMesh || !mesh.material) return [];
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function SceneController({
  command,
  groupRef,
  controlsRef,
  section,
}: {
  command: ModelCommand;
  groupRef: RefObject<Group | null>;
  controlsRef: RefObject<any>;
  section: { enabled: boolean; axis: SectionAxis; offset: number };
}) {
  const bounds = useBounds();
  const { camera, gl } = useThree();

  const frameFromDirection = useCallback((direction: Vector3) => {
    const root = groupRef.current;
    if (!root) return;
    const box = new Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const distance = Math.max(size.length() * .85, 1);
    camera.position.copy(center).add(direction.clone().normalize().multiplyScalar(distance));
    camera.up.copy(Math.abs(direction.y) > .9 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0));
    controlsRef.current?.target.copy(center);
    controlsRef.current?.update();
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [camera, controlsRef, groupRef]);

  useEffect(() => {
    if (!command.seq) return;
    const controls = controlsRef.current;
    const target = controls?.target instanceof Vector3 ? controls.target : new Vector3();
    if (command.type === 'zoom-in' || command.type === 'zoom-out') {
      const factor = command.type === 'zoom-in' ? .82 : 1.22;
      camera.position.copy(target.clone().add(camera.position.clone().sub(target).multiplyScalar(factor)));
      camera.updateProjectionMatrix();
      controls?.update();
    }
    if (command.type === 'rotate' && groupRef.current) {
      groupRef.current.rotation.y += Math.PI / 2;
    }
    if (command.type === 'fit') bounds.refresh().clip().fit();
    if (command.type === 'view' && command.view) frameFromDirection(viewDirections[command.view]);
    if (command.type === 'reset') {
      groupRef.current?.rotation.set(0, 0, 0);
      frameFromDirection(viewDirections.iso);
    }
  }, [bounds, camera, command, frameFromDirection, groupRef, controlsRef]);

  useEffect(() => {
    if (!section.enabled || !groupRef.current) {
      gl.clippingPlanes = [];
      return;
    }
    const box = new Box3().setFromObject(groupRef.current);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const normal = section.axis === 'x'
      ? new Vector3(1, 0, 0)
      : section.axis === 'y'
        ? new Vector3(0, 1, 0)
        : new Vector3(0, 0, 1);
    const axisCenter = section.axis === 'x' ? center.x : section.axis === 'y' ? center.y : center.z;
    const axisSize = section.axis === 'x' ? size.x : section.axis === 'y' ? size.y : size.z;
    const position = axisCenter + (section.offset * axisSize) / 2;
    gl.clippingPlanes = [new Plane(normal, -position)];
    return () => { gl.clippingPlanes = []; };
  }, [gl, groupRef, section]);

  return null;
}

function MeasurementLine({ measurement, unitLabel }: { measurement: Measurement; unitLabel: string }) {
  const midpoint = measurement.start.clone().add(measurement.end).multiplyScalar(.5);
  const distance = measurement.start.distanceTo(measurement.end);
  return (
    <>
      <Line points={[measurement.start, measurement.end]} color="#ef4444" lineWidth={2} />
      <Html position={midpoint} center>
        <span className="ga-measure-label">{distance.toFixed(3)} {unitLabel}</span>
      </Html>
    </>
  );
}

function ModelScene({
  url,
  object,
  format,
  command,
  projection,
  section,
  selectedId,
  measurementMode,
  measurement,
  onMeasurement,
  onRoot,
  onSelect,
  unitLabel,
}: {
  url: string;
  object: Object3D | null;
  format: EngineeringModelFormat;
  command: ModelCommand;
  projection: Projection;
  section: { enabled: boolean; axis: SectionAxis; offset: number };
  selectedId: string | null;
  measurementMode: boolean;
  measurement: Measurement | null;
  onMeasurement: (point: Vector3) => void;
  onRoot: (root: Object3D) => void;
  onSelect: (uuid: string | null) => void;
  unitLabel: string;
}) {
  const groupRef = useRef<Group>(null);
  const controlsRef = useRef<any>(null);
  const rootRef = useRef<Object3D | null>(null);
  const highlightedRef = useRef<Material[]>([]);
  const emissiveRef = useRef<Map<Material, string>>(new Map());

  const ready = useCallback((root: Object3D) => {
    rootRef.current = root;
    onRoot(root);
  }, [onRoot]);

  useEffect(() => {
    highlightedRef.current.forEach(material => {
      const standard = material as MeshStandardMaterial;
      const previous = emissiveRef.current.get(material);
      if ('emissive' in standard && previous != null) standard.emissive.set(previous);
    });
    highlightedRef.current = [];
    emissiveRef.current.clear();
    if (!selectedId || !rootRef.current) return;
    const selected = rootRef.current.getObjectByProperty('uuid', selectedId);
    if (!selected) return;
    selected.traverse(child => {
      materialsOf(child).forEach(material => {
        const standard = material as MeshStandardMaterial;
        if (!('emissive' in standard)) return;
        emissiveRef.current.set(material, `#${standard.emissive.getHexString()}`);
        standard.emissive.set('#3155e7');
        highlightedRef.current.push(material);
      });
    });
  }, [selectedId]);

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (measurementMode) {
      onMeasurement(event.point.clone());
      return;
    }
    onSelect(event.object.uuid);
  };

  return (
    <>
      {projection === 'perspective' ? (
        <PerspectiveCamera makeDefault position={[4, 3, 6]} fov={42} near={.01} far={1_000_000} />
      ) : (
        <OrthographicCamera makeDefault position={[4, 3, 6]} zoom={70} near={-1_000_000} far={1_000_000} />
      )}
      <ambientLight intensity={1.15} />
      <directionalLight position={[6, 8, 5]} intensity={2.1} castShadow />
      <Bounds fit clip observe margin={1.18}>
        <Center>
          <group
            ref={groupRef}
            onPointerDown={onPointerDown}
            onPointerMissed={() => !measurementMode && onSelect(null)}
          >
            <ModelAsset url={url} object={object} format={format} onReady={ready} />
          </group>
        </Center>
        <SceneController
          command={command}
          groupRef={groupRef}
          controlsRef={controlsRef}
          section={section}
        />
      </Bounds>
      {measurement && <MeasurementLine measurement={measurement} unitLabel={unitLabel} />}
      <OrbitControls ref={controlsRef} makeDefault enableDamping enablePan enableRotate enableZoom />
      <Environment preset="warehouse" />
      <gridHelper args={[20, 20, '#9fb2c8', '#dce5ef']} position={[0, -1.5, 0]} />
    </>
  );
}

function buildTree(root: Object3D): TreeNode {
  const convert = (object: Object3D): TreeNode => ({
    uuid: object.uuid,
    label: object.name?.trim() || (object.type === 'Mesh' ? 'Component' : object.type),
    kind: object.type,
    children: object.children.map(convert),
  });
  return convert(root);
}

function TreeItem({
  node,
  selectedId,
  hiddenIds,
  onSelect,
}: {
  node: TreeNode;
  selectedId: string | null;
  hiddenIds: Set<string>;
  onSelect: (uuid: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <li className="ga-model-tree-item" role="treeitem" aria-expanded={node.children.length ? expanded : undefined}>
      <div className={`ga-model-tree-row${selectedId === node.uuid ? ' is-selected' : ''}`}>
        {node.children.length ? (
          <button type="button" className="ga-tree-toggle" onClick={() => setExpanded(value => !value)} aria-label={expanded ? 'Collapse component' : 'Expand component'}>
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : <span className="ga-tree-toggle-spacer" />}
        <button type="button" className="ga-tree-label" onClick={() => onSelect(node.uuid)} title={node.label}>
          {hiddenIds.has(node.uuid) ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>{node.label}</span>
        </button>
      </div>
      {expanded && node.children.length > 0 && (
        <ul role="group">
          {node.children.map(child => (
            <TreeItem key={child.uuid} node={child} selectedId={selectedId} hiddenIds={hiddenIds} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

function formatFromName(fileName: string, format: string): EngineeringModelFormat | null {
  const normalized = (format || fileName.split('.').pop() || '').toLowerCase().replace(/^\./, '');
  if (
    normalized === 'glb'
    || normalized === 'gltf'
    || normalized === 'obj'
    || normalized === 'stl'
    || normalized === 'fbx'
    || normalized === 'step'
    || normalized === 'stp'
    || normalized === 'ifc'
  ) {
    return normalized;
  }
  return null;
}

export default function EngineeringModelViewer({
  blob,
  fileName,
  format,
  className = '',
}: EngineeringModelViewerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<Object3D | null>(null);
  const originalOpacityRef = useRef<Map<Material, { opacity: number; transparent: boolean; depthWrite: boolean }>>(new Map());
  const measureStartRef = useRef<Vector3 | null>(null);
  const [url, setUrl] = useState('');
  const [sourceModel, setSourceModel] = useState<Object3D | null>(null);
  const [unitLabel, setUnitLabel] = useState('model units');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [treeOpen, setTreeOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [transparent, setTransparent] = useState(false);
  const [projection, setProjection] = useState<Projection>('perspective');
  const [section, setSection] = useState<{ enabled: boolean; axis: SectionAxis; offset: number }>({ enabled: false, axis: 'x', offset: 0 });
  const [measurementMode, setMeasurementMode] = useState(false);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [command, setCommand] = useState<ModelCommand>({ type: 'fit', seq: 0 });
  const modelFormat = formatFromName(fileName, format);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    let parsedRoot: Object3D | null = null;
    setError('');
    setLoading(Boolean(modelFormat));
    setUrl('');
    setSourceModel(null);
    setUnitLabel('model units');
    setSelectedId(null);
    setTree(null);
    setHiddenIds(new Set());
    setMeasurement(null);
    setTransparent(false);
    originalOpacityRef.current.clear();
    measureStartRef.current = null;
    if (!modelFormat) {
      setLoading(false);
      return () => controller.abort();
    }

    if (modelFormat === 'step' || modelFormat === 'stp' || modelFormat === 'ifc') {
      void loadEngineeringSourceModel(blob, modelFormat, controller.signal)
        .then(loaded => {
          if (controller.signal.aborted) {
            disposeEngineeringModel(loaded.root);
            return;
          }
          parsedRoot = loaded.root;
          setUnitLabel(loaded.unitLabel);
          setSourceModel(loaded.root);
          setLoading(false);
        })
        .catch(reason => {
          if (reason instanceof DOMException && reason.name === 'AbortError') return;
          setError(reason instanceof Error ? reason.message : 'model-error');
          setLoading(false);
        });
    } else {
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      setLoading(false);
    }

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (parsedRoot) disposeEngineeringModel(parsedRoot);
      rootRef.current = null;
    };
  }, [blob, modelFormat]);

  const onRoot = useCallback((root: Object3D) => {
    rootRef.current = root;
    setTree(buildTree(root));
  }, []);

  const send = (type: ModelCommand['type'], view?: ViewName) => {
    setCommand(current => ({ type, view, seq: current.seq + 1 }));
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) return void document.exitFullscreen();
    try { await shellRef.current?.requestFullscreen(); } catch { /* browser denied */ }
  };

  const hideSelected = () => {
    if (!selectedId || !rootRef.current) return;
    const object = rootRef.current.getObjectByProperty('uuid', selectedId);
    if (!object) return;
    object.visible = false;
    setHiddenIds(current => new Set(current).add(selectedId));
    setSelectedId(null);
  };

  const showAll = () => {
    rootRef.current?.traverse(object => { object.visible = true; });
    setHiddenIds(new Set());
  };

  const toggleTransparency = () => {
    const next = !transparent;
    if (!next) {
      originalOpacityRef.current.forEach((original, material) => {
        material.opacity = original.opacity;
        material.transparent = original.transparent;
        material.depthWrite = original.depthWrite;
        material.needsUpdate = true;
      });
      originalOpacityRef.current.clear();
      setTransparent(false);
      return;
    }
    const selected = selectedId && rootRef.current
      ? rootRef.current.getObjectByProperty('uuid', selectedId)
      : rootRef.current;
    selected?.traverse(child => {
      materialsOf(child).forEach(material => {
        if (!originalOpacityRef.current.has(material)) {
          originalOpacityRef.current.set(material, { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
        }
        const original = originalOpacityRef.current.get(material)!;
        material.opacity = next ? .32 : original.opacity;
        material.transparent = next ? true : original.transparent;
        material.depthWrite = !next;
        material.needsUpdate = true;
      });
    });
    setTransparent(true);
  };

  const addMeasurePoint = (point: Vector3) => {
    if (!measureStartRef.current) {
      measureStartRef.current = point;
      setMeasurement(null);
      return;
    }
    setMeasurement({ start: measureStartRef.current, end: point });
    measureStartRef.current = null;
  };

  if (!modelFormat) {
    return (
      <div className={`ga-model-viewer ${className}`.trim()}>
        <div className="ga-viewer-message" role="alert">
          This model requires a browser-compatible GLB preview. The original {format.toUpperCase()} file has not been modified.
        </div>
      </div>
    );
  }

  return (
    <div ref={shellRef} className={`ga-model-viewer ga-engineering-viewer ${className}`.trim()}>
      <div className="ga-viewer-toolbar ga-engineering-toolbar" role="toolbar" aria-label="3D model controls">
        <button type="button" onClick={() => send('zoom-out')} title="Zoom out"><ZoomOut size={18} /></button>
        <button type="button" onClick={() => send('zoom-in')} title="Zoom in"><ZoomIn size={18} /></button>
        <button type="button" onClick={() => send('rotate')} title="Rotate model 90 degrees"><RotateCcw size={17} /><span>Rotate</span></button>
        <button type="button" onClick={() => send('fit')}><span>Fit model</span></button>
        <button type="button" onClick={() => send('reset')}><RefreshCw size={17} /><span>Reset</span></button>
        <span className="ga-toolbar-divider" aria-hidden />
        {(['front', 'top', 'side', 'iso'] as ViewName[]).map(view => (
          <button key={view} type="button" onClick={() => send('view', view)} title={`${view} view`}>
            <span>{view === 'iso' ? 'Isometric' : `${view[0].toUpperCase()}${view.slice(1)}`}</span>
          </button>
        ))}
        <button
          type="button"
          className={projection === 'orthographic' ? 'is-active' : ''}
          onClick={() => {
            setProjection(value => value === 'perspective' ? 'orthographic' : 'perspective');
            setCommand(current => ({ type: 'fit', seq: current.seq + 1 }));
          }}
        >
          <span>{projection === 'perspective' ? 'Perspective' : 'Orthographic'}</span>
        </button>
        <span className="ga-toolbar-divider" aria-hidden />
        <button type="button" className={treeOpen ? 'is-active' : ''} onClick={() => setTreeOpen(value => !value)}><span>Model tree</span></button>
        <button type="button" onClick={hideSelected} disabled={!selectedId} title="Hide selected component"><EyeOff size={17} /><span>Hide</span></button>
        <button type="button" onClick={showAll} disabled={!hiddenIds.size}><Eye size={17} /><span>Show all</span></button>
        <button type="button" className={transparent ? 'is-active' : ''} onClick={toggleTransparency}><span>Transparency</span></button>
        <button type="button" className={section.enabled ? 'is-active' : ''} onClick={() => setSection(current => ({ ...current, enabled: !current.enabled }))}><span>Section</span></button>
        <button type="button" className={measurementMode ? 'is-active' : ''} onClick={() => { setMeasurementMode(value => !value); measureStartRef.current = null; }}><span>Measure</span></button>
        <button type="button" onClick={() => void toggleFullscreen()} title="Fullscreen"><Maximize size={18} /></button>
      </div>

      {section.enabled && (
        <div className="ga-section-controls" aria-label="Section clipping controls">
          <span>Section plane</span>
          <select value={section.axis} onChange={event => setSection(current => ({ ...current, axis: event.target.value as SectionAxis }))} aria-label="Section axis">
            <option value="x">X axis</option>
            <option value="y">Y axis</option>
            <option value="z">Z axis</option>
          </select>
          <input type="range" min={-1} max={1} step={.01} value={section.offset} onChange={event => setSection(current => ({ ...current, offset: Number(event.target.value) }))} aria-label="Section position" />
          <button type="button" onClick={() => setSection({ enabled: false, axis: 'x', offset: 0 })}>Clear</button>
        </div>
      )}

      <div className="ga-engineering-workspace">
        {treeOpen && (
          <aside className="ga-model-tree" aria-label="Model tree">
            <div className="ga-model-tree-head">
              <strong>Model components</strong>
              <span>{tree ? 'Select a component' : loading ? 'Loading hierarchy…' : 'Hierarchy unavailable'}</span>
            </div>
            {tree && <ul role="tree"><TreeItem node={tree} selectedId={selectedId} hiddenIds={hiddenIds} onSelect={setSelectedId} /></ul>}
          </aside>
        )}
        <div className={`ga-model-canvas${measurementMode ? ' is-measuring' : ''}`}>
          {error ? (
            <div className="ga-viewer-message" role="alert">The uploaded 3D model could not be displayed. {error !== 'model-error' ? error : ''} The original file has not been modified.</div>
          ) : loading ? (
            <DwesGaViewerLoading label="Loading and validating the engineering model…" />
          ) : url || sourceModel ? (
            <ModelErrorBoundary key={sourceModel?.uuid || url} onError={() => setError('model-error')}>
              <Canvas shadows dpr={[1, 2]} gl={{ localClippingEnabled: true }} onCreated={({ gl }) => { gl.localClippingEnabled = true; }}>
                <color attach="background" args={['#eef3f8']} />
                <Suspense fallback={(
                  <Html center>
                    <DwesLoadingIndicator label="Loading engineering model…" size="sm" />
                  </Html>
                )}>
                  <ModelScene
                    url={url}
                    object={sourceModel}
                    format={modelFormat}
                    command={command}
                    projection={projection}
                    section={section}
                    selectedId={selectedId}
                    measurementMode={measurementMode}
                    measurement={measurement}
                    onMeasurement={addMeasurePoint}
                    onRoot={onRoot}
                    onSelect={setSelectedId}
                    unitLabel={unitLabel}
                  />
                </Suspense>
              </Canvas>
            </ModelErrorBoundary>
          ) : null}
        </div>
      </div>

      <div className="ga-model-hint" role="status">
        {measurementMode
          ? measurement
            ? `${measurement.start.distanceTo(measurement.end).toFixed(3)} ${unitLabel} · Measurements use source-model coordinates.`
            : measureStartRef.current
              ? `Select the second point. Measurements use source-model ${unitLabel}.`
              : `Select two model points. Measurements use source-model ${unitLabel}.`
          : selectedId
            ? 'Component selected · use Hide or Transparency as needed.'
            : 'Drag to orbit · right-drag to pan · scroll or pinch to zoom'}
      </div>
    </div>
  );
}
