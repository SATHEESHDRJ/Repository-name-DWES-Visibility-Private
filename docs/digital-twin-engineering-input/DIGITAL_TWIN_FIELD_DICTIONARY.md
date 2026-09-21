# Digital Twin Field Dictionary

## panel-metadata.csv
- **project_code**: Unique identifier for the overall DWES project.
- **project_name**: Human-readable name.
- **panel_id**: Authoritative identifier for the specific switchgear panel.
- **coordinate_origin**: Explanation of where (0,0,0) is located (e.g., "bottom-left-front").
- **coordinate_system**: Default is Cartesian right-handed.
- **engineering_unit**: Default `mm`. Must match manifest.

## device-geometry.csv
- **device_tag**: The exact electrical schedule reference (e.g., `-K1`).
- **mounting_location**: e.g., "backplate", "door", "side".
- **x_mm, y_mm, z_mm**: The anchor point for the device bounding box.
- **width_mm, height_mm, depth_mm**: Bounding dimensions. Must be positive.

## terminal-geometry.csv
- **terminal_number**: The exact pin or connector number.
- **direction**: The vector approach direction for routing (e.g., "TOP", "BOTTOM", "FRONT").

## duct-nodes.csv
- **node_id**: Arbitrary unique identifier (e.g., `N100`).
- **node_type**: entry, exit, junction, corner, branch, endpoint, transition.

## duct-segments.csv
- **segment_id**: Arbitrary unique identifier.
- **source_node_id**: Must reference a valid `node_id`.
- **destination_node_id**: Must reference a valid `node_id`.
- **length_mm**: Physical distance. Must be positive.

## cable-route-overrides.csv
- **route_classification**: Must be one of `approved-exact-route`, `calculated-guidance-route`, `endpoint-guidance`, `drawing-reference-only`, `visualization-unavailable`.
- **ordered_duct_node_ids**: A pipe-separated sequence of nodes (e.g., `N1|N5|N12`).
