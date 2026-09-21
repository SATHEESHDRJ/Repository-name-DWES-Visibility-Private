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

// Global 401 handler — clear token and redirect to login
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('dwes_token');
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

  logout: () => api.post('/auth/logout').then(r => r.data),

  me: () => api.get('/me').then(r => r.data),

  health: () => api.get('/health').then(r => r.data),

  env: () => api.get('/env').then(r => r.data),

  hints: () => api.get('/login-hints').then(r => r.data),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => api.get('/users').then(r => r.data),

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

  submitToDirector: (code: string) =>
    api.post(`/projects/${code}/submit-to-director`).then(r => r.data),

  reportPdf: (code: string) =>
    api.get(`/projects/${code}/report-pdf`, { responseType: 'blob' }).then(r => r.data),

  frames: (code: string) => api.get(`/projects/${code}/frames`).then(r => r.data),

  frame: (code: string, frameId: string) =>
    api.get(`/projects/${code}/frames/${frameId}`).then(r => r.data),

  deleteFrame: (code: string, frameId: string) =>
    api.delete(`/projects/${code}/frames/${frameId}`).then(r => r.data),

  cables: (code: string) => api.get(`/projects/${code}/cables`).then(r => r.data),

  compareVerify: (code: string, frameId: string) =>
    api.post(`/projects/${code}/frames/${frameId}/compare-verify`).then(r => r.data),

  compareSubmit: (code: string, frameId: string) =>
    api.post(`/projects/${code}/frames/${frameId}/compare-submit`).then(r => r.data),

  compareStatus: (code: string, frameId: string) =>
    api.get(`/projects/${code}/frames/${frameId}/compare-status`).then(r => r.data),

  drawings: (code: string) => api.get(`/projects/${code}/drawings`).then(r => r.data),

  deleteDrawing: (code: string, file: string) =>
    api.delete(`/projects/${code}/drawings/${file}`).then(r => r.data),
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

  uploadMapped: (code: string, formData: FormData) =>
    api.post(`/upload/wiring-schedule-mapped/${code}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  checkHash: (hash: string, fileName: string, fileType: string) =>
    api.post('/check-hash', { hash, file_name: fileName, file_type: fileType }).then(r => r.data),

  drawing: (code: string, formData: FormData) =>
    api.post(`/upload/drawing/${code}`, formData, {
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

  cableStatus: (assignmentId: number, cableIndex: number, field: 'src' | 'dst' | 'note', value: boolean | string) =>
    api.post('/tech/cable-status', { assignment_id: assignmentId, cable_index: cableIndex, field, value }).then(r => r.data),

  cableAction: (assignmentId: number, cableIndex: number, action: 'complete' | 'src_only' | 'dst_only', note?: string) =>
    api.post('/tech/cable-action', { assignment_id: assignmentId, cable_index: cableIndex, action, note }).then(r => r.data),

  report: (id: number) => api.get(`/tech/report/${id}`).then(r => r.data),

  submitReport: (id: number) => api.post(`/tech/submit-report/${id}`).then(r => r.data),

  hide: (id: number) => api.post(`/tech/hide/${id}`).then(r => r.data),

  delete: (id: number) => api.delete(`/tech/assignment/${id}`).then(r => r.data),

  myAssignmentDetail: (id: number) => api.get(`/tech/my-assignment/${id}`).then(r => r.data),

  myReadyStatus: () => api.get('/tech/my-ready-status').then(r => r.data),

  markReady: () => api.post('/tech/mark-ready').then(r => r.data),

  cancelReady: () => api.post('/tech/cancel-ready').then(r => r.data),

  readyForAssignment: (id: number) =>
    api.post(`/tech/ready-for-assignment/${id}`).then(r => r.data),

  audit: (code: string) => api.get(`/tech/audit/${code}`).then(r => r.data),
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

  changeover: (oldId: number, newTechId: number) =>
    api.post('/tech/changeover', { old_assignment_id: oldId, new_technician_id: newTechId }).then(r => r.data),

  readyTechs: () => api.get('/supervisor/ready-technicians').then(r => r.data),

  assignFrame: (dto: unknown) => api.post('/tech/assign-frame', dto).then(r => r.data),

  panelReport: (code: string, frame: string) =>
    api.get(`/supervisor/panel-report/${code}/${frame}`).then(r => r.data),

  panelReportXlsx: (code: string, frame: string) =>
    api.get(`/supervisor/panel-report/${code}/${frame}/xlsx`, { responseType: 'blob' }).then(r => r.data),
};

// ─── Director ─────────────────────────────────────────────────────────────────

export const directorApi = {
  stats: () => api.get('/director/stats').then(r => r.data),

  projects: () => api.get('/director/projects').then(r => r.data),

  workforce: () => api.get('/director/workforce').then(r => r.data),

  activity: (limit?: number) =>
    api.get('/director/activity', { params: limit ? { limit } : {} }).then(r => r.data),

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

  sessions: (limit?: number) =>
    api.get('/admin/sessions', { params: limit ? { limit } : {} }).then(r => r.data),

  clearSessions: () => api.post('/admin/sessions/clear').then(r => r.data),

  allUsers: () => api.get('/admin/users').then(r => r.data),

  changeRole: (id: number, role: string) =>
    api.post(`/admin/users/${id}/change-role`, { role }).then(r => r.data),
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
