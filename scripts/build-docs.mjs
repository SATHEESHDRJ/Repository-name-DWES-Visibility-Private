import fs from 'fs';
import path from 'path';
const TEMPLATE_DIR = 'docs/digital-twin-engineering-input/templates/';
const DOCS_DIR = 'docs/digital-twin-engineering-input/';

function write(p, content) {
  fs.writeFileSync(p, content.trim() + '\\n');
}

write(TEMPLATE_DIR + 'device-geometry.csv', 'project_code,panel_id,model_revision,device_tag,normalized_device_tag,device_type,manufacturer,model_number,mounting_location,x_mm,y_mm,z_mm,width_mm,height_mm,depth_mm,rotation_x_deg,rotation_y_deg,rotation_z_deg,drawing_sheet,drawing_layer,cad_block_reference,validation_status,remarks');
write(TEMPLATE_DIR + 'terminal-geometry.csv', 'project_code,panel_id,model_revision,device_tag,terminal_block,terminal_number,normalized_terminal_reference,terminal_type,x_mm,y_mm,z_mm,direction,drawing_sheet,drawing_element_reference,validation_status,remarks');
write(TEMPLATE_DIR + 'duct-nodes.csv', 'project_code,panel_id,model_revision,node_id,duct_identifier,x_mm,y_mm,z_mm,node_type,enabled,remarks');
write(TEMPLATE_DIR + 'duct-segments.csv', 'project_code,panel_id,model_revision,segment_id,duct_identifier,source_node_id,destination_node_id,length_mm,width_mm,height_mm,maximum_capacity,preferred_direction,routing_restriction,enabled,remarks');
write(TEMPLATE_DIR + 'device-aliases.csv', 'project_code,panel_id,schedule_device_reference,engineering_device_tag,alias_type,approved_by,approval_date,remarks');
write(TEMPLATE_DIR + 'terminal-aliases.csv', 'project_code,panel_id,device_tag,schedule_terminal_reference,engineering_terminal_reference,alias_type,approved_by,approval_date,remarks');
write(TEMPLATE_DIR + 'cable-route-overrides.csv', 'project_code,panel_id,wiring_row_reference,cable_number,source_device,source_terminal,destination_device,destination_terminal,route_classification,ordered_duct_node_ids,route_length_mm,drawing_revision,schedule_revision,model_revision,validation_status,approved_by,approval_date,remarks');

const assetManifest = {
  projectCode: '',
  panelId: '',
  drawingNumber: '',
  drawingTitle: '',
  drawingRevision: '',
  scheduleRevision: '',
  modelRevision: '',
  units: 'mm',
  coordinateSystem: '',
  origin: '',
  approvedDrawing: '',
  dwgFile: '',
  dxfFile: '',
  stepFile: '',
  ifcFile: '',
  glbFile: '',
  gltfFile: '',
  panelMetadataFile: 'panel-metadata.csv',
  deviceGeometryFile: 'device-geometry.csv',
  terminalGeometryFile: 'terminal-geometry.csv',
  ductNodesFile: 'duct-nodes.csv',
  ductSegmentsFile: 'duct-segments.csv',
  deviceAliasesFile: 'device-aliases.csv',
  terminalAliasesFile: 'terminal-aliases.csv',
  cableRouteOverridesFile: 'cable-route-overrides.csv',
  preparedBy: '',
  checkedBy: '',
  approvedBy: '',
  approvalDate: '',
  checksum: '',
  notes: ''
};
write(TEMPLATE_DIR + 'engineering-asset-manifest.json', JSON.stringify(assetManifest, null, 2));

const pkgManifest = {
  version: '1.0',
  type: 'digital-twin-engineering-package',
  timestamp: '',
  assets: []
};
write(TEMPLATE_DIR + 'digital-twin-package-manifest.json', JSON.stringify(pkgManifest, null, 2));

