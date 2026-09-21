import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const jsonReportFlagIdx = args.indexOf('--json-report');
let jsonReportPath = null;
if (jsonReportFlagIdx > -1 && args.length > jsonReportFlagIdx + 1) {
  jsonReportPath = args[jsonReportFlagIdx + 1];
  args.splice(jsonReportFlagIdx, 2);
}
const pkgDir = args[0];

if (!pkgDir) {
  console.error('Usage: node validate-package.mjs <package-directory> [--json-report <path>]');
  process.exit(1);
}

const errors = [];
const warnings = [];

function addError(msg) { errors.push(msg); }
function addWarning(msg) { warnings.push(msg); }

const SUPPORTED_EXTS = ['.csv', '.json', '.pdf', '.dwg', '.dxf', '.step', '.ifc', '.glb', '.gltf'];
const EXECUTABLE_EXTS = ['.exe', '.sh', '.bat', '.cmd', '.js', '.mjs', '.ps1'];

function isSafeFilename(name, field) {
  if (!name) return true;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    addError(`Path traversal detected in ${field}: ${name}`);
    return false;
  }
  if (path.isAbsolute(name)) {
    addError(`Absolute path rejected in ${field}: ${name}`);
    return false;
  }
  if (name.length > 255) {
    addError(`Excessive filename length in ${field}: ${name}`);
    return false;
  }
  if (/[\x00-\x1F]/.test(name)) {
    addError(`Control character detected in ${field}: ${name}`);
    return false;
  }
  if (name.split('.').length > 2) {
    addError(`Double extension detected in ${field}: ${name}`);
    return false;
  }
  const ext = path.extname(name).toLowerCase();
  if (EXECUTABLE_EXTS.includes(ext)) {
    addError(`Executable file rejected in ${field}: ${name}`);
    return false;
  }
  if (ext && !SUPPORTED_EXTS.includes(ext)) {
    addError(`Unsupported file extension in ${field}: ${name}`);
    return false;
  }
  const fullPath = path.join(pkgDir, name);
  if (fs.existsSync(fullPath)) {
    if (fs.lstatSync(fullPath).isSymbolicLink()) {
      addError(`Symbolic link detected in ${field}: ${name}`);
      return false;
    }
  }
  return true;
}

const manifestPath = path.join(pkgDir, 'engineering-asset-manifest.json');
if (!fs.existsSync(manifestPath)) {
  addError('Missing engineering-asset-manifest.json');
  reportAndExit();
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (e) {
  addError('Invalid JSON in engineering-asset-manifest.json');
  reportAndExit();
}

const reqFields = ['projectCode', 'panelId', 'drawingNumber', 'drawingRevision'];
reqFields.forEach(f => {
  if (!manifest[f]) addError(`Missing required field in manifest: ${f}`);
});

if (manifest.units && manifest.units !== 'mm') {
  addError(`Unsupported units: ${manifest.units}. Must be mm.`);
}

if (!manifest.checksum) {
  addWarning('Missing checksum in manifest');
}

['panelMetadataFile', 'deviceGeometryFile', 'terminalGeometryFile', 'ductNodesFile', 'ductSegmentsFile', 'deviceAliasesFile', 'terminalAliasesFile', 'cableRouteOverridesFile', 'gltfFile'].forEach(field => {
  if (manifest[field]) isSafeFilename(manifest[field], field);
});

if (manifest.gltfFile) {
  const gltfPath = path.join(pkgDir, manifest.gltfFile);
  if (fs.existsSync(gltfPath)) {
    const gltfContent = fs.readFileSync(gltfPath, 'utf8');
    if (gltfContent.includes('"uri"') && (gltfContent.includes('http://') || gltfContent.includes('https://'))) {
      addError(`External resource reference detected in gltf: ${manifest.gltfFile}`);
    }
  }
}

function readCsv(filename) {
  const fullPath = path.join(pkgDir, filename);
  if (!fs.existsSync(fullPath)) return null;
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');
    return obj;
  });
}

function checkConsistency(rows, filename) {
  if (!rows || rows.length === 0) return;
  rows.forEach(r => {
    if (r.project_code && r.project_code !== manifest.projectCode) addError(`Project code mismatch in ${filename}`);
    if (r.panel_id && r.panel_id !== manifest.panelId) addError(`Panel ID mismatch in ${filename}`);
    if (r.model_revision && r.model_revision !== manifest.modelRevision) addError(`Model revision mismatch in ${filename}`);
    if (r.drawing_revision && r.drawing_revision !== manifest.drawingRevision) addError(`Drawing revision mismatch in ${filename}`);
    if (r.schedule_revision && r.schedule_revision !== manifest.scheduleRevision) addError(`Schedule revision mismatch in ${filename}`);
  });
}

const panelMeta = readCsv(manifest.panelMetadataFile || 'panel-metadata.csv');
if (!panelMeta) addError('Missing panel metadata file');
else checkConsistency(panelMeta, 'panel metadata');

const devices = readCsv(manifest.deviceGeometryFile || 'device-geometry.csv');
const deviceTags = new Set();
if (!devices) addError('Missing device geometry file');
else {
  checkConsistency(devices, 'device geometry');
  if (devices.length > 0 && !Object.keys(devices[0]).includes('device_tag')) addError('Missing device_tag header in device geometry');
  devices.forEach(d => {
    if (!d.device_tag) addError('Empty device_tag found');
    else if (deviceTags.has(d.device_tag)) addError(`Duplicate device tag: ${d.device_tag}`);
    deviceTags.add(d.device_tag);
    if (d.width_mm < 0 || d.height_mm < 0 || d.depth_mm < 0) addError(`Negative dimension for device: ${d.device_tag}`);
    if (isNaN(Number(d.x_mm)) || isNaN(Number(d.y_mm))) addError(`Invalid coordinates for device: ${d.device_tag}`);
  });
}

const terminals = readCsv(manifest.terminalGeometryFile || 'terminal-geometry.csv');
const terminalRefs = new Set();
if (!terminals) addError('Missing terminal geometry file');
else {
  checkConsistency(terminals, 'terminal geometry');
  terminals.forEach(t => {
    if (!deviceTags.has(t.device_tag)) addError(`Terminal references unknown device: ${t.device_tag}`);
    const ref = t.device_tag + ':' + t.terminal_number;
    if (terminalRefs.has(ref)) addError(`Duplicate terminal: ${ref}`);
    terminalRefs.add(ref);
    if (isNaN(Number(t.x_mm))) addError(`Invalid terminal coordinate: ${ref}`);
  });
}

const nodes = readCsv(manifest.ductNodesFile || 'duct-nodes.csv');
const nodeIds = new Set();
if (nodes) {
  checkConsistency(nodes, 'duct nodes');
  nodes.forEach(n => {
    if (nodeIds.has(n.node_id)) addError(`Duplicate node: ${n.node_id}`);
    nodeIds.add(n.node_id);
  });
}

const segments = readCsv(manifest.ductSegmentsFile || 'duct-segments.csv');
const segmentIds = new Set();
if (segments) {
  checkConsistency(segments, 'duct segments');
  
  // Graph connectivity check structures
  const adj = new Map();
  nodeIds.forEach(id => adj.set(id, []));

  segments.forEach(s => {
    if (segmentIds.has(s.segment_id)) addError(`Duplicate segment: ${s.segment_id}`);
    segmentIds.add(s.segment_id);
    if (s.source_node_id === s.destination_node_id) addError(`Self-connected segment: ${s.segment_id}`);
    if (!nodeIds.has(s.source_node_id)) addError(`Segment ${s.segment_id} references missing source node: ${s.source_node_id}`);
    if (!nodeIds.has(s.destination_node_id)) addError(`Segment ${s.segment_id} references missing dest node: ${s.destination_node_id}`);
    if (Number(s.length_mm) < 0) addError(`Negative length in segment: ${s.segment_id}`);
    
    if (adj.has(s.source_node_id)) adj.get(s.source_node_id).push(s.destination_node_id);
    if (adj.has(s.destination_node_id)) adj.get(s.destination_node_id).push(s.source_node_id);
  });

  const usedNodes = new Set();
  segments.forEach(s => { usedNodes.add(s.source_node_id); usedNodes.add(s.destination_node_id); });
  if (nodes) {
    nodes.forEach(n => {
      if (!usedNodes.has(n.node_id)) addWarning(`Orphan node: ${n.node_id}`);
    });
  }

  // Check for disconnected graph components
  if (nodeIds.size > 0 && usedNodes.size > 0) {
    const visited = new Set();
    const startNode = Array.from(usedNodes)[0];
    const q = [startNode];
    visited.add(startNode);
    while (q.length > 0) {
      const curr = q.shift();
      const neighbors = adj.get(curr) || [];
      neighbors.forEach(n => {
        if (!visited.has(n)) {
          visited.add(n);
          q.push(n);
        }
      });
    }
    if (visited.size < usedNodes.size) {
      addError('Disconnected duct graph components detected');
    }
  }
}

const overrides = readCsv(manifest.cableRouteOverridesFile || 'cable-route-overrides.csv');
if (overrides) {
  checkConsistency(overrides, 'cable route overrides');
  const validClasses = ['approved-exact-route', 'calculated-guidance-route', 'endpoint-guidance', 'drawing-reference-only', 'visualization-unavailable'];
  const overrideSet = new Set();
  overrides.forEach(o => {
    const key = o.cable_number + ':' + o.wiring_row_reference;
    if (overrideSet.has(key)) addError(`Duplicate route override for cable: ${o.cable_number}`);
    overrideSet.add(key);

    if (!validClasses.includes(o.route_classification)) addError(`Invalid route classification: ${o.route_classification}`);
    if (o.route_classification === 'approved-exact-route' && (!o.approved_by || !o.approval_date)) {
      addError(`Missing approval fields for approved exact route on cable ${o.cable_number}`);
    }
    if (o.ordered_duct_node_ids) {
      const parts = o.ordered_duct_node_ids.split('|');
      parts.forEach(p => {
        if (!nodeIds.has(p)) addError(`Invalid ordered duct node reference: ${p} in cable ${o.cable_number}`);
      });
    }
  });
}

reportAndExit();

function reportAndExit() {
  const result = {
    valid: errors.length === 0,
    errors,
    warnings
  };
  
  if (jsonReportPath) {
    fs.writeFileSync(jsonReportPath, JSON.stringify(result, null, 2));
  }
  
  if (errors.length > 0) {
    console.error('Validation Failed:');
    errors.forEach(e => console.error('  [ERROR] ' + e));
  } else {
    console.log('Validation Passed.');
  }
  if (warnings.length > 0) {
    warnings.forEach(w => console.warn('  [WARN] ' + w));
  }
  
  process.exit(errors.length > 0 ? 1 : 0);
}
