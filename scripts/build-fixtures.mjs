import fs from 'fs';
import path from 'path';
const validDir = 'scripts/digital-twin-input-validation/fixtures/valid-package';
const invalidDir = 'scripts/digital-twin-input-validation/fixtures/invalid-package';

function write(p, content) { fs.writeFileSync(p, content.trim() + '\\n'); }

// Valid Fixture
write(path.join(validDir, 'engineering-asset-manifest.json'), JSON.stringify({
  projectCode: 'DEMO',
  panelId: 'DEMO-001',
  drawingNumber: 'DEMO-DWG-01',
  drawingRevision: 'R01',
  modelRevision: 'M01',
  units: 'mm',
  panelMetadataFile: 'panel-metadata.csv',
  deviceGeometryFile: 'device-geometry.csv',
  terminalGeometryFile: 'terminal-geometry.csv',
  ductNodesFile: 'duct-nodes.csv',
  ductSegmentsFile: 'duct-segments.csv'
}, null, 2));

write(path.join(validDir, 'panel-metadata.csv'), 'project_code,panel_id,model_revision\\nDEMO,DEMO-001,M01');
write(path.join(validDir, 'device-geometry.csv'), 'device_tag,x_mm,y_mm,width_mm,height_mm,depth_mm\\nDEV1,10,10,100,100,50\\nDEV2,20,20,50,50,20');
write(path.join(validDir, 'terminal-geometry.csv'), 'device_tag,terminal_number,x_mm,y_mm\\nDEV1,T1,10,10\\nDEV2,T2,20,20');
write(path.join(validDir, 'duct-nodes.csv'), 'node_id\\nN1\\nN2');
write(path.join(validDir, 'duct-segments.csv'), 'segment_id,source_node_id,destination_node_id,length_mm\\nS1,N1,N2,100');

// Invalid Fixture
write(path.join(invalidDir, 'engineering-asset-manifest.json'), JSON.stringify({
  projectCode: 'DEMO',
  panelId: 'DEMO-001',
  drawingNumber: 'DEMO-DWG-01',
  drawingRevision: 'R01',
  modelRevision: 'M01',
  units: 'mm',
  panelMetadataFile: 'panel-metadata.csv',
  deviceGeometryFile: 'device-geometry.csv',
  terminalGeometryFile: 'terminal-geometry.csv',
  ductNodesFile: 'duct-nodes.csv',
  ductSegmentsFile: 'duct-segments.csv',
  cableRouteOverridesFile: 'cable-route-overrides.csv'
}, null, 2));

write(path.join(invalidDir, 'panel-metadata.csv'), 'project_code,panel_id,model_revision\\nWRONG,DEMO-001,M01'); // Project mismatch
write(path.join(invalidDir, 'device-geometry.csv'), 'device_tag,x_mm,y_mm,width_mm,height_mm,depth_mm\\nDEV1,10,10,100,-10,50\\nDEV1,20,20,50,50,20'); // Duplicate DEV1, negative height
write(path.join(invalidDir, 'terminal-geometry.csv'), 'device_tag,terminal_number,x_mm,y_mm\\nDEV1,T1,10,10\\nDEV1,T1,20,20\\nDEV99,T1,0,0'); // Duplicate T1, unknown DEV99
write(path.join(invalidDir, 'duct-nodes.csv'), 'node_id\\nN1\\nN2');
write(path.join(invalidDir, 'duct-segments.csv'), 'segment_id,source_node_id,destination_node_id,length_mm\\nS1,N1,N3,100\\nS2,N1,N1,50'); // Unknown N3, Self-connected N1
write(path.join(invalidDir, 'cable-route-overrides.csv'), 'route_classification,cable_number,approved_by,approval_date\\nfake-class,C1,,\\napproved-exact-route,C2,,'); // Invalid class, missing approval

