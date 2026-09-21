# Digital Twin File Naming Standard

To ensure machine readability and prevent file-system exploits, all engineering assets must strictly adhere to the following naming convention.

## Allowed Characters
Files must contain ONLY:
- Uppercase letters `A-Z`
- Numbers `0-9`
- Underscores `_`
- Hyphens `-`
- A single dot `.` followed by the extension.

**Prohibited**: Spaces, slashes, brackets, special characters.

## Master Format

`[PROJECTCODE]_[PANELID]_[DRAWINGNUMBER]_[REVISION]_[ASSETTYPE].[ext]`

## Examples

- **Approved GA PDF**: `132KV_H001_GA001_R01_APPROVED_GA.pdf`
- **Device Geometry CSV**: `132KV_H001_GA001_R01_DEVICE_GEOMETRY.csv`
- **3D Model GLB**: `132KV_H001_GA001_R01_MODEL.glb`
- **Manifest**: `132KV_H001_GA001_R01_MANIFEST.json`
