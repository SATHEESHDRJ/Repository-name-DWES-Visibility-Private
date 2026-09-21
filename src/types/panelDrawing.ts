export type PanelDrawingSlot = '2d' | '3d';

export type PanelDrawingPreviewStatus = 'source' | 'pending' | 'ready' | 'failed';

export interface PanelDrawingPreview {
  filename: string;
  content_type?: string;
  format: string;
  status: PanelDrawingPreviewStatus;
  error?: string;
}

export interface PanelDrawingAsset {
  id: string;
  kind: '2d' | '3d';
  filename: string;
  original_name: string;
  content_type?: string;
  source_format: string;
  size?: number;
  sha256?: string;
  uploaded_at?: string;
  uploaded_by?: string;
  preview?: PanelDrawingPreview | null;
}

export interface PanelDrawingPermissions {
  can_view: boolean;
  can_upload_2d: boolean;
  can_replace_2d: boolean;
  can_upload_3d: boolean;
  can_replace_3d: boolean;
  can_download_2d: boolean;
  can_download_3d: boolean;
}

export interface PanelDrawingPackage {
  id: string;
  project_code: string;
  frame_id: string;
  revision: number;
  created_at?: string;
  updated_at?: string;
  drawing_2d: PanelDrawingAsset | null;
  model_3d: PanelDrawingAsset | null;
  permissions: PanelDrawingPermissions;
}

export const EMPTY_PANEL_DRAWING_PERMISSIONS: PanelDrawingPermissions = {
  can_view: false,
  can_upload_2d: false,
  can_replace_2d: false,
  can_upload_3d: false,
  can_replace_3d: false,
  can_download_2d: false,
  can_download_3d: false,
};

export function panelDrawingAssetForSlot(pkg: PanelDrawingPackage, slot: PanelDrawingSlot) {
  return slot === '2d' ? pkg.drawing_2d : pkg.model_3d;
}

export function canUploadPanelDrawingSlot(pkg: PanelDrawingPackage, slot: PanelDrawingSlot) {
  const asset = panelDrawingAssetForSlot(pkg, slot);
  if (slot === '2d') {
    return asset ? pkg.permissions.can_replace_2d : pkg.permissions.can_upload_2d;
  }
  return asset ? pkg.permissions.can_replace_3d : pkg.permissions.can_upload_3d;
}

export function canDownloadPanelDrawingSlot(pkg: PanelDrawingPackage, slot: PanelDrawingSlot) {
  return slot === '2d'
    ? pkg.permissions.can_download_2d
    : pkg.permissions.can_download_3d;
}
