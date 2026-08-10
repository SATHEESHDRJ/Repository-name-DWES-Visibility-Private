/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIVE_TB_DEMO_ENABLED?: string;
  readonly VITE_ENABLE_OPERATIONAL_TWIN_3D?: string;
  readonly VITE_OT3D_QUALITY?: string;
  readonly VITE_QA_QC_WORKFLOW_ENABLED?: string;
  readonly VITE_DWES_LIVE_TB_DEBUG?: string;
  readonly VITE_DWES_HTTPS_PORT?: string;
  readonly VITE_DWES_HOSTNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
