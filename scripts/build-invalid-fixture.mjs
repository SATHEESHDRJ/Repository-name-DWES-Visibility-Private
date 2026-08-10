import fs from 'fs';
import path from 'path';
const invalidDir = 'scripts/digital-twin-input-validation/fixtures/invalid-package';

function write(p, content) { fs.writeFileSync(p, content.trim() + '\\n'); }

write(path.join(invalidDir, 'engineering-asset-manifest.json'), JSON.stringify({
  projectCode: 'DEMO',
  panelId: 'DEMO-001',
  drawingNumber: 'DEMO-DWG-01',
  drawingRevision: 'R01',
  modelRevision: 'M01',
  scheduleRevision: 'S01',
  units: 'inch', // Unsupported unit
  panelMetadataFile: '../panel-metadata.csv', // Path traversal
  deviceGeometryFile: 'C:/device-geometry.csv', // Absolute path
  terminalGeometryFile: 'terminal-geometry.exe', // Executable extension
  ductNodesFile: 'duct-nodes.csv',
  ductSegmentsFile: 'duct-segments.csv',
  cableRouteOverridesFile: 'cable-route-overrides.csv',
  gltfFile: 'model.gltf'
}, null, 2));

write(path.join(invalidDir, 'model.gltf'), JSON.stringify({
  images: [{ uri: 'https://evil.com/texture.jpg' }]
}));

write(path.join(invalidDir, 'panel-metadata.csv'), 'project_code,panel_id,model_revision,drawing_revision,schedule_revision\\nWRONG,DEMO-001,M01,R01,S01'); // Project mismatch
write(path.join(invalidDir, 'device-geometry.csv'), 'project_code,panel_id,model_revision,drawing_revision,schedule_revision,device_tag,x_mm,y_mm,width_mm,height_mm,depth_mm\\nDEMO,DEMO-001,M01,R01,S01,DEV1,10,10,100,100,50\\nDEMO,DEMO-001,M01,R01,S01,DEV2,20,20,50,50,20');
write(path.join(invalidDir, 'terminal-geometry.csv'), 'project_code,panel_id,model_revision,drawing_revision,schedule_revision,device_tag,terminal_number,x_mm,y_mm\\nDEMO,DEMO-001,M01,R01,S01,DEV1,T1,10,10\\nDEMO,DEMO-001,M01,R01,S01,DEV2,T2,20,20');
write(path.join(invalidDir, 'duct-nodes.csv'), 'project_code,panel_id,model_revision,drawing_revision,schedule_revision,node_id\\nDEMO,DEMO-001,M01,R01,S01,N1\\nDEMO,DEMO-001,M01,R01,S01,N2\\nDEMO,DEMO-001,M01,R01,S01,N3\\nDEMO,DEMO-001,M01,R01,S01,N4\\nDEMO,DEMO-001,M01,R01,S01,N5'); // N5 orphan
write(path.join(invalidDir, 'duct-segments.csv'), 'project_code,panel_id,model_revision,drawing_revision,schedule_revision,segment_id,source_node_id,destination_node_id,length_mm\\nDEMO,DEMO-001,M01,R01,S01,S1,N1,N2,100\\nDEMO,DEMO-001,M01,R01,S01,S2,N3,N4,100'); // N1-N2 and N3-N4 disconnected
write(path.join(invalidDir, 'cable-route-overrides.csv'), 'project_code,panel_id,model_revision,drawing_revision,schedule_revision,route_classification,cable_number,wiring_row_reference,ordered_duct_node_ids,approved_by,approval_date\\nDEMO,DEMO-001,M01,R01,S01,approved-exact-route,C1,W1,N1|N99,,\\nDEMO,DEMO-001,M01,R01,S01,approved-exact-route,C1,W1,N1|N2,,'); // Duplicate override, invalid node N99, missing approval

