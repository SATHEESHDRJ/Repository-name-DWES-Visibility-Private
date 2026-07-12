import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from localStorage on every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('dwes_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global 401 handler — try refresh once, then clear session.
let refreshInFlight: Promise<string | null> | null = null;

async function tryRefreshSession(): Promise<string | null> {
  const refresh = localStorage.getItem('dwes_refresh_token');
  if (!refresh) return null;
  if (!refreshInFlight) {
    refreshInFlight = api.post('/auth/refresh', { refresh_token: refresh })
      .then((res) => {
        const data = res.data;
        localStorage.setItem('dwes_token', data.access_token);
        if (data.refresh_token) localStorage.setItem('dwes_refresh_token', data.refresh_token);
        if (data.user) localStorage.setItem('dwes_user', JSON.stringify(data.user));
        return data.access_token as string;
      })
      .catch(() => null)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

api.interceptors.response.use(
  res => res,
  async err => {
    const url: string = err.config?.url ?? '';
    const isLoginRequest = url.includes('/auth/login');
    const isRefreshRequest = url.includes('/auth/refresh');
    if (err.response?.status === 401 && !isLoginRequest && !isRefreshRequest && !err.config?._retry) {
      const newToken = await tryRefreshSession();
      if (newToken) {
        err.config._retry = true;
        err.config.headers.Authorization = `Bearer ${newToken}`;
        return api.request(err.config);
      }
      localStorage.removeItem('dwes_token');
      localStorage.removeItem('dwes_refresh_token');
      localStorage.removeItem('dwes_user');
      window.location.href = '/';
    }
    return Promise.reject(err);
  },
);

export default api;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string, project_code?: string) =>
    api.post('/auth/login', { username, password, project_code }).then(r => r.data),

  refresh: (refresh_token: string) =>
    api.post('/auth/refresh', { refresh_token }).then(r => r.data),

  logout: (refresh_token?: string) =>
    api.post('/auth/logout', refresh_token ? { refresh_token } : {}).then(r => r.data),

  me: () => api.get('/me').then(r => r.data),

  health: () => api.get('/health').then(r => r.data),

  env: () => api.get('/env').then(r => r.data),

  hints: () => api.get('/login-hints').then(r => r.data),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => api.get('/users').then(r => r.data),

  get: (id: number) => api.get(`/users/${id}`).then(r => r.data),

  technicians: () => api.get('/users/technicians').then(r => r.data),

  create: (dto: unknown) => api.post('/users', dto).then(r => r.data),

  update: (id: number, dto: unknown) => api.put(`/users/${id}`, dto).then(r => r.data),

  toggleStatus: (id: number) => api.post(`/users/${id}/toggle-status`).then(r => r.data),

  resetPassword: (id: number, password: string) =>
    api.post(`/users/${id}/reset-password`, { password }).then(r => r.data),

  remove: (id: number) => api.delete(`/users/${id}`).then(r => r.data),
};

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projectsApi = {
  list: () => api.get('/projects').then(r => r.data),

  create: (dto: unknown) => api.post('/projects', dto).then(r => r.data),

  update: (code: string, dto: unknown) => api.put(`/projects/${code}`, dto).then(r => r.data),

  remove: (code: string) => api.delete(`/projects/${code}`).then(r => r.data),

  setState: (code: string, state: string) =>
    api.post(`/projects/${code}/state`, { state }).then(r => r.data),

  assign: (code: string, techIds: string[]) =>
    api.post(`/projects/${code}/assign`, { technicians: techIds }).then(r => r.data),

  frameReportPdf: (code: string, frameId: string) =>
    api.get(`/projects/${code}/frames/${frameId}/report-pdf`, { responseType: 'blob' }).then(r => r.data),

  panelCompletionReport: (code: string, frameId: string) =>
    api.get(`/projects/${code}/frames/${frameId}/completion-report`).then(r => r.data),

  reportPdf: (code: string, frameId?: string) =>
    frameId
      ? api.get(`/projects/${code}/frames/${frameId}/report-pdf`, { responseType: 'blob' }).then(r => r.data)
      : api.get(`/projects/${code}/report-pdf`, { responseType: 'blob' }).then(r => r.data),

  reportXlsx: (code: string) =>
    api.get(`/projects/${code}/report-xlsx`, { responseType: 'blob' }).then(r => r.data as Blob),

  submitToDirector: (code: string) =>
    api.post(`/projects/${code}/submit-to-director`).then(r => r.data),

  frames: (code: string) => api.get(`/projects/${code}/frames`).then(r => r.data),

  createPanel: (
    code: string,
    dto: { name: string; type?: string; voltage_level: string; system_type?: string },
  ) => api.post(`/projects/${code}/frames`, dto).then(r => r.data),

  frame: (code: string, frameId: string) =>
    api.get(`/projects/${code}/frames/${frameId}`).then(r => r.data),

  cables: (code: string) => api.get(`/projects/${code}/cables`).then(r => r.data),

  compareVerify: (code: string, frameId: string) =>
    api.post(`/projects/${code}/frames/${frameId}/compare-verify`).then(r => r.data),

  compareSubmit: (code: string, frameId: string) =>
    api.post(`/projects/${code}/frames/${frameId}/compare-submit`).then(r => r.data),

  compareStatus: (code: string, frameId: string) =>
    api.get(`/projects/${code}/frames/${frameId}/compare-status`).then(r => r.data),

  verifyData: (code: string, frameId: string) =>
    api.get(`/projects/${code}/frames/${frameId}/verify-data`).then(r => r.data),

  patchCable: (code: string, frameId: string, idx: number, field: string, value: string) =>
    api.post(`/projects/${code}/frames/${frameId}/patch-cable`, { cable_index: idx, field, value }).then(r => r.data),

  patchPanel: (
    code: string,
    frameId: string,
    payload: {
      panel_name: string;
      panel_type?: string;
      voltage_level?: string;
      system_type?: string;
    },
  ) =>
    api.post(`/projects/${code}/frames/${frameId}/patch-panel`, payload).then(r => r.data),

  remapColumn: (code: string, frameId: string, systemField: string, excelHeader: string) =>
    api.post(`/projects/${code}/frames/${frameId}/remap-column`, { system_field: systemField, excel_header: excelHeader }).then(r => r.data),

  verifyConfirm: (code: string, frameId: string) =>
    api.post(`/projects/${code}/frames/${frameId}/verify-confirm`).then(r => r.data),

  compareSourceFile: (code: string, frameId: string, formData: FormData) =>
    api.post(`/projects/${code}/frames/${frameId}/compare-source-file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  drawings: (code: string) => api.get(`/projects/${code}/drawings`).then(r => r.data),

  // Fetch a drawing file as a Blob (auth header is attached by the axios interceptor;
  // a raw new-tab GET would not carry the JWT). Caller decides inline-open vs download.
  drawingFile: (code: string, id: string) =>
    api.get(`/projects/${code}/drawings/${id}/file`, { responseType: 'blob' }).then(r => r.data as Blob),

  deleteFramePrecheck: (code: string, frameId: string) =>
    api.get(`/projects/${code}/frames/${frameId}/delete-precheck`).then(r => r.data),

  deleteFrameGuarded: (code: string, frameId: string, confirmedPhrase: string) =>
    api.post(`/projects/${code}/frames/${frameId}/delete-guarded`, { confirmed_phrase: confirmedPhrase }).then(r => r.data),

  deleteDrawingPrecheck: (code: string, drawingId: string) =>
    api.get(`/projects/${code}/drawings/${drawingId}/delete-precheck`).then(r => r.data),

  deleteDrawingGuarded: (code: string, drawingId: string, confirmedPhrase: string) =>
    api.post(`/projects/${code}/drawings/${drawingId}/delete-guarded`, { confirmed_phrase: confirmedPhrase }).then(r => r.data),

  deleteDrawing: (code: string, drawingId: string) =>
    api.delete(`/projects/${code}/drawings/${drawingId}`).then(r => r.data),

  directorReports: (code: string) => api.get(`/projects/${code}/director-reports`).then(r => r.data),

  directorReportFile: (code: string, id: string) =>
    api.get(`/projects/${code}/director-reports/${id}/file`, { responseType: 'blob' }).then(r => r.data as Blob),

  deleteDirectorReport: (code: string, reportId: string) =>
    api.delete(`/projects/${code}/director-reports/${reportId}`).then(r => r.data),
};

// ─── Upload ───────────────────────────────────────────────────────────────────

export const uploadApi = {
  extractMetadata: (formData: FormData) =>
    api.post('/upload/extract-metadata', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  readHeaders: (code: string, formData: FormData) =>
    api.post(`/upload/read-headers/${code}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  uploadMapped: (code: string, formData: FormData, onProgress?: (pct: number) => void, frameId?: string) => {
    if (frameId && !formData.has('frame_id')) formData.append('frame_id', frameId);
    return api.post(`/upload/wiring-schedule-mapped/${code}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
        ? e => onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
        : undefined,
    }).then(r => r.data);
  },

  previewMapped: (code: string, formData: FormData) =>
    api.post(`/upload/preview-mapped/${code}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  checkHash: (hash: string, fileName: string, fileType: string, projectCode?: string) =>
    api.post('/check-hash', { hash, file_name: fileName, file_type: fileType, project_code: projectCode }).then(r => r.data),

  drawing: (code: string, formData: FormData, onProgress?: (pct: number) => void) =>
    api.post(`/upload/drawing/${code}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
        ? e => onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
        : undefined,
    }).then(r => r.data),

  directorReport: (code: string, formData: FormData) =>
    api.post(`/upload/director-report/${code}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),
};

// ─── Technician ───────────────────────────────────────────────────────────────

export const techApi = {
  myPanels: () => api.get('/tech/my-panels').then(r => r.data),

  start: (id: number) => api.post(`/tech/start/${id}`).then(r => r.data),

  pause: (id: number, elapsed: number, reason: string) =>
    api.post(`/tech/pause/${id}`, { elapsed_seconds: elapsed, reason }).then(r => r.data),

  resume: (id: number) => api.post(`/tech/resume/${id}`).then(r => r.data),

  complete: (id: number) => api.post(`/tech/complete/${id}`).then(r => r.data),

  /** Reopen a completed panel for rework; reason required when the report was already submitted. */
  rework: (id: number, reason = '') => api.post(`/tech/rework/${id}`, { reason }).then(r => r.data),

  cableStatus: (assignmentId: number, cableIndex: number, field: 'src' | 'dst' | 'note' | 'issue', value: boolean | string) =>
    api.post('/tech/cable-status', { assignment_id: assignmentId, cable_index: cableIndex, field, value }).then(r => r.data),

  cableAction: (assignmentId: number, cableIndex: number, action: 'complete' | 'src_only' | 'dst_only' | 'reset_all', note?: string) =>
    api.post('/tech/cable-action', { assignment_id: assignmentId, cable_index: cableIndex, action, note }).then(r => r.data),

  /** DEMO_MODE only — bulk dev helpers (404 when DEMO_MODE off). */
  devCableBulk: (assignmentId: number, action: 'mark_all_verified' | 'mark_all_with_issues' | 'reset_all') =>
    api.post(`/tech/dev/cable-bulk/${assignmentId}`, { action }).then(r => r.data),

  report: (id: number) => api.get(`/tech/report/${id}`).then(r => r.data),

  submitReport: (id: number, notes = '') =>
    api.post(`/tech/submit-report/${id}`, { notes }).then(r => r.data),

  hide: (id: number) => api.post(`/tech/hide/${id}`).then(r => r.data),

  delete: (id: number) => api.delete(`/tech/assignment/${id}`).then(r => r.data),

  myAssignmentDetail: (id: number) => api.get(`/tech/my-assignment/${id}`).then(r => r.data),

  completionReport: (id: number) => api.get(`/tech/completion-report/${id}`).then(r => r.data),

  audit: (code: string) => api.get(`/tech/audit/${code}`).then(r => r.data),

  verifyOtp: (id: number, code: string) =>
    api.post(`/tech/verify-otp/${id}`, { code }).then(r => r.data),

  getQr: (id: number) => api.get(`/tech/qr/${id}`).then(r => r.data),

  scanQr: (qrData: string) =>
    api.post('/tech/scan-qr', { qr_data: qrData }).then(r => r.data),

  devOtpHint: (id: number) => api.get(`/tech/dev/otp-hint/${id}`).then(r => r.data),
};

// ─── Supervisor ───────────────────────────────────────────────────────────────

export const supervisorApi = {
  allPanels: () => api.get('/supervisor/all-panels').then(r => r.data),

  reviewPanels: (code: string) => api.get(`/supervisor/review-panels/${code}`).then(r => r.data),

  panelDetail: (id: number) => api.get(`/supervisor/panel-detail/${id}`).then(r => r.data),

  review: (id: number, status: string, notes?: string) =>
    api.post(`/supervisor/review/${id}`, { review_status: status, review_notes: notes }).then(r => r.data),

  pendingApprovals: () => api.get('/supervisor/pending-approvals').then(r => r.data),

  approve: (id: number) => api.post(`/supervisor/approve-assignment/${id}`).then(r => r.data),

  rework: (id: number, reason: string) =>
    api.post(`/supervisor/rework-assignment/${id}`, { reason }).then(r => r.data),

  pendingChangeovers: () => api.get('/supervisor/pending-changeovers').then(r => r.data),

  changeoverCandidate: (projectCode: string, frameId: string) =>
    api.get(`/supervisor/changeover-candidate/${encodeURIComponent(projectCode)}/${encodeURIComponent(frameId)}`).then(r => r.data),

  midChangeover: (payload: {
    old_assignment_id: number;
    new_technician_id: number;
    changeover_reason: string;
    reason_notes?: string;
  }) => api.post('/supervisor/mid-changeover', payload).then(r => r.data),

  changeover: (oldId: number, newTechId: number, changeoverReason?: string, reasonNotes?: string) =>
    api.post('/tech/changeover', {
      old_assignment_id: oldId,
      new_technician_id: newTechId,
      changeover_reason: changeoverReason,
      reason_notes: reasonNotes,
    }).then(r => r.data),

  frameProgress: (projectCode: string, frameId: string) =>
    api.get(`/supervisor/frame-progress/${projectCode}/${frameId}`).then(r => r.data),

  completionReport: (id: number) =>
    api.get(`/supervisor/completion-report/${id}`).then(r => r.data),

  assignFrame: (dto: unknown) => api.post('/tech/assign-frame', dto).then(r => r.data),

  panelReport: (code: string, frame: string) =>
    api.get(`/supervisor/panel-report/${code}/${frame}`).then(r => r.data),

  panelReportXlsx: (code: string, frame: string) =>
    api.get(`/supervisor/panel-report/${code}/${frame}/xlsx`, { responseType: 'blob' }).then(r => r.data),

  wiringScheduleXlsx: (code: string, frameId: string) =>
    api.get(`/supervisor/wiring-schedule/${code}/${frameId}/xlsx`, { responseType: 'blob' }).then(r => r.data as Blob),
};

// ─── Director ─────────────────────────────────────────────────────────────────

export const directorApi = {
  stats: () => api.get('/director/stats').then(r => r.data),

  projects: () => api.get('/director/projects').then(r => r.data),

  workforce: () => api.get('/director/workforce').then(r => r.data),

  activity: (limit?: number) =>
    api.get('/director/activity', { params: limit ? { limit } : {} }).then(r => r.data),

  projectsSummary: () => api.get('/director/projects-summary').then(r => r.data),

  export: (format: 'csv' | 'xlsx' | 'pdf') =>
    api.get(`/director/export?format=${format}`, { responseType: 'blob' }).then(r => r.data),
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminApi = {
  diagnostics: () => api.get('/admin/diagnostics').then(r => r.data),

  clearCache: () => api.post('/admin/diagnostics/clear-cache').then(r => r.data),

  resetCounters: () => api.post('/admin/diagnostics/reset-counters').then(r => r.data),

  dbPing: () => api.post('/admin/diagnostics/db-ping').then(r => r.data),

  syncStorage: () => api.get('/admin/sync/storage').then(r => r.data),

  syncInspect: () => api.post('/admin/sync/inspect').then(r => r.data),

  syncStatus: () => api.get('/admin/sync/status').then(r => r.data),

  syncExecute: (strategy: string) =>
    api.post('/admin/sync/execute', { strategy }).then(r => r.data),

  allUsers: () => api.get('/admin/users').then(r => r.data),

  changeRole: (id: number, role: string) =>
    api.post(`/admin/users/${id}/change-role`, { role }).then(r => r.data),

  bulkSetRole: (pattern: string, role: string) =>
    api.post('/admin/users/bulk-role', { pattern, role }).then(r => r.data),

  // Database configuration (System Admin only)
  getDbConfig: () => api.get('/admin/db-config').then(r => r.data),

  setDbConfig: (mode: 'local' | 'cloud', cloudUrl?: string, notes?: string) =>
    api.post('/admin/db-config', { mode, cloudUrl, notes }).then(r => r.data),

  getDeploymentConfig: () => api.get('/admin/deployment-config').then(r => r.data),

  setDeploymentConfig: (
    mode: 'intranet' | 'cloud',
    cloudAppUrl?: string,
    cloudTier?: string,
    cloudRegion?: string,
    notes?: string,
  ) => api.post('/admin/deployment-config', { mode, cloudAppUrl, cloudTier, cloudRegion, notes }).then(r => r.data),

  testDbConnection: (url: string) =>
    api.post('/admin/db-config/test', { url }).then(r => r.data),

  triggerRestart: () => api.post('/admin/restart').then(r => r.data),

  fileStorageInfo: () => api.get('/admin/file-storage').then(r => r.data),

  hardResetPrecheck: (code: string) =>
    api.get(`/admin/projects/${code}/hard-reset`).then(r => r.data),

  hardReset: (code: string, confirmedCode: string) =>
    api.post(`/admin/projects/${code}/hard-reset`, { confirmed_code: confirmedCode }).then(r => r.data),

  hardDeletePrecheck: (code: string) =>
    api.get(`/admin/projects/${code}/hard-delete`).then(r => r.data),

  hardDelete: (code: string) =>
    api.post(`/admin/projects/${code}/hard-delete`).then(r => r.data),

  resetAllPrecheck: () =>
    api.get('/admin/reset-all-projects').then(r => r.data),

  resetAllProjects: (confirmedPhrase: string) =>
    api.post('/admin/reset-all-projects', { confirmed_phrase: confirmedPhrase }).then(r => r.data),
};

// ─── Dev (DEMO_MODE / ALLOW_DEV_HARD_RESET only) ─────────────────────────────

export const devApi = {
  hardResetPrecheck: () => api.get('/dev/hard-reset').then(r => r.data),

  hardReset: (confirmedPhrase: string) =>
    api.post('/dev/hard-reset', { confirmed_phrase: confirmedPhrase }).then(r => r.data),
};

// ─── QA/QC ────────────────────────────────────────────────────────────────────

export const qaqcApi = {
  stats: () => api.get('/qaqc/stats').then(r => r.data),

  readyPanels: () => api.get('/qaqc/ready-panels').then(r => r.data),

  allCompleted: () => api.get('/qaqc/all-completed').then(r => r.data),

  panelDetail: (id: number) => api.get(`/qaqc/panel-detail/${id}`).then(r => r.data),

  inspect: (assignmentId: number, dto: unknown) =>
    api.post(`/qaqc/inspect-panel/${assignmentId}`, dto).then(r => r.data),

  getInspection: (id: number) => api.get(`/qaqc/inspection/${id}`).then(r => r.data),

  allInspections: () => api.get('/qaqc/inspections').then(r => r.data),

  myInspections: () => api.get('/qaqc/my-inspections').then(r => r.data),
};
