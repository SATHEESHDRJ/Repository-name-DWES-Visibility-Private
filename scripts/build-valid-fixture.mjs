import fs from 'fs';
import path from 'path';
const validDir = 'scripts/digital-twin-input-validation/fixtures/valid-package';

function write(p, content) { fs.writeFileSync(p, content.trim() + '\\n'); }

write(path.join(validDir, 'engineering-asset-manifest.json'), JSON.stringify({
  projectCode: 'DEMO',
  panelId: 'DEMO-001',
  drawingNumber: 'DEMO-DWG-01',
  drawingRevision: 'R01',
  modelRevision: 'M01',
  scheduleRevision: 'S01',
  units: 'mm',
  checksum: '123456',
  panelMetadataFile: 'panel-metadata.csv',
  deviceGeometryFile: 'device-geometry.csv',
  terminalGeometryFile: 'terminal-geometry.csv',
  ductNodesFile: 'duct-nodes.csv',
  ductSegmentsFile: 'duct-segments.csv',
  cableRouteOverridesFile: 'cable-route-overrides.csv'
}, null, 2));

write(path.join(validDir, 'panel-metadata.csv'), 'project_code,panel_id,model_revision,drawing_revision,schedule_revision\\nDEMO,DEMO-001,M01,R01,S01');
write(path.join(validDir, 'device-geometry.csv'), 'project_code,panel_id,model_revision,drawing_revision,schedule_revision,device_tag,x_mm,y_mm,width_mm,height_mm,depth_mm\\nDEMO,DEMO-001,M01,R01,S01,DEV1,10,10,100,100,50\\nDEMO,DEMO-001,M01,R01,S01,DEV2,20,20,50,50,20');
write(path.join(validDir, 'terminal-geometry.csv'), 'project_code,panel_id,model_revision,drawing_revision,schedule_revision,device_tag,terminal_number,x_mm,y_mm\\nDEMO,DEMO-001,M01,R01,S01,DEV1,T1,10,10\\nDEMO,DEMO-001,M01,R01,S01,DEV2,T2,20,20');
write(path.join(validDir, 'duct-nodes.csv'), 'project_code,panel_id,model_revision,drawing_revision,schedule_revision,node_id\\nDEMO,DEMO-001,M01,R01,S01,N1\\nDEMO,DEMO-001,M01,R01,S01,N2');
write(path.join(validDir, 'duct-segments.csv'), 'project_code,panel_id,model_revision,drawing_revision,schedule_revision,segment_id,source_node_id,destination_node_id,length_mm\\nDEMO,DEMO-001,M01,R01,S01,S1,N1,N2,100');
write(path.join(validDir, 'cable-route-overrides.csv'), 'project_code,panel_id,model_revision,drawing_revision,schedule_revision,route_classification,cable_number,wiring_row_reference,ordered_duct_node_ids,approved_by,approval_date\\nDEMO,DEMO-001,M01,R01,S01,approved-exact-route,C1,W1,N1|N2,user,2026-07-16\\nDEMO,DEMO-001,M01,R01,S01,calculated-guidance-route,C2,W2,N1,user,2026-07-16');

