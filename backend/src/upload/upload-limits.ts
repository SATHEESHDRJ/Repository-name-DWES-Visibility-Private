/**
 * Upload size cap shared by the multipart plugin registration (main.ts) and
 * anything that needs to report the limit. Engineering PDF/IFC/STEP/GLB
 * sources frequently exceed 50 MB, so the cap stays explicit and configurable
 * (DWES_MAX_UPLOAD_MB, default 250, clamped 1–1024) — same policy as the
 * previous MulterModule registration.
 */
const configuredUploadMb = Number(process.env.DWES_MAX_UPLOAD_MB || 250);

export const UPLOAD_LIMIT_MB = Number.isFinite(configuredUploadMb)
  ? Math.min(1024, Math.max(1, Math.floor(configuredUploadMb)))
  : 250;

export const UPLOAD_LIMIT_BYTES = UPLOAD_LIMIT_MB * 1024 * 1024;
