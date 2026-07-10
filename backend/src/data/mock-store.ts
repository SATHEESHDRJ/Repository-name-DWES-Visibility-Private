import * as bcrypt from 'bcryptjs';

// ─── Primitive types ──────────────────────────────────────────────────────────

export type UserRole =
  | 'system_admin' | 'ops_director' | 'prod_supervisor'
  | 'qaqc_engineer' | 'wiring_technician';

export type ProjectState =
  | 'not_started' | 'active' | 'stopped' | 'pending'
  | 'wiring_started' | 'wiring_stopped' | 'completed'
  | 'completed_by_tech' | 'submitted_to_director'
  | 'report_generated' | 'in_review';

export type AssignmentStatus = 'assigned' | 'in_progress' | 'paused' | 'completed';
export type ReviewStatus = 'approved' | 'rework' | 'ready_for_qc' | null;
export type CompareStatus = 'none' | 'verified' | 'validated';

// ─── Entity interfaces ────────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  hashed_password: string;
  full_name: string;
  employee_id: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  whatsapp_number: string;
  ready_for_assignment: boolean;
  ready_since: string | null;
}

export interface Project {
  id: number;
  code: string;
  client: string;
  name: string;
  description: string;
  sequence: number;
  is_active: boolean;
  created_at: string;
  project_state: ProjectState;
  assigned_technicians: string;
}

export interface Cable {
  sno: number | string;
  panel: string;
  ferrule: string;
  source_device: string;
  source_terminal: string;
  source: string;
  destination: string;
  dest_device: string;
  dest_terminal: string;
  ref: string;
  color: string;
  size: string;
  length: string;
  sign: string;
  remarks: string;
  path: string;
  rack: string;
  _raw?: Record<string, string>;
}

export interface CompareResult {
  total: number;
  matched: number;
  partial: number;
  mismatch: number;
  missing: number;
  errors: Array<{ sno: number | string; ferrule: string; issue: string }>;
  checked_at: string;
}

export interface FrameData {
  id: string;
  project_code: string;
  panel_name: string;
  cables: Cable[];
  uploaded_at: string;
  compare_status: CompareStatus;
  original_filename: string;
  cable_count: number;
  mapping: Record<string, string>;
  sheet_name: string;
  excel_headers?: string[];
  header_row?: number;
  file_buffer?: Buffer;
  compare_result?: CompareResult;
  /** Optional metadata when panel is created with the project (no wiring upload yet). */
  panel_type?: string;
  panel_description?: string;
  /** Per-panel electrical / system metadata (may differ within one project). */
  voltage_level?: string;
  system_type?: string;
}

export interface Drawing {
  id: string;
  project_code: string;
  filename: string;
  original_name: string;
  content_type: string;
  uploaded_at: string;
  size: number;
  buffer?: Buffer;
}

export interface DirectorReport {
  id: string;
  project_code: string;
  filename: string;
  original_name: string;
  content_type: string;
  uploaded_at: string;
  size: number;
  buffer?: Buffer;
}

export interface CableStatus {
  src: boolean;
  dst: boolean;
  note: string;
}

export interface TechAssignment {
  id: number;
  project_code: string;
  frame_id: string;
  panel_name: string;
  technician_id: number;
  assigned_by: number;
  assigned_at: string;
  status: AssignmentStatus;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  total_wiring_seconds: number;
  cables_total: number;
  cables_src_done: number;
  cables_dst_done: number;
  cable_status: Record<string, CableStatus>;
  is_hidden: boolean;
  report_submitted: boolean;
  report_submitted_at: string | null;
  review_status: ReviewStatus;
  review_notes: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  supervisor_approved: boolean;
  approved_at: string | null;
  approved_by: number | null;
  rework_requested: boolean;
  rework_reason: string;
  rework_requested_at: string | null;
  rework_requested_by: number | null;
  pause_reason: string;
  changeover_locked: boolean;
  handover_from_id: number | null;
  handover_to_id: number | null;
  qc_status: 'not_ready' | 'passed' | 'failed' | 'conditional';
}

export interface SessionLog {
  id: number;
  user_id: number;
  action: 'login' | 'logout' | 'server_shutdown';
  project_code: string;
  login_role: string;
  created_at: string;
  ip_address: string;
}

export interface FileHash {
  id: number;
  file_hash: string;
  file_name: string;
  file_type: 'wiring_schedule' | 'drawing';
  project_code: string;
  uploaded_at: string;
}

export interface TechAuditLog {
  id: number;
  technician_id: number;
  technician_name: string;
  project_code: string;
  frame_id: string;
  panel_name: string;
  action: string;
  details: string;
  created_at: string;
}

export interface PanelInspection {
  id: number;
  assignment_id: number;
  qc_user_id: number;
  visual_check: string;
  visual_note: string;
  redmarkup_check: string;
  redmarkup_note: string;
  redmarkup_photo_hash: string;
  labeling_check: string;
  labeling_note: string;
  ferrule_check: string;
  ferrule_note: string;
  compliance_check: string;
  compliance_note: string;
  overall_result: string;
  issues: unknown[];
  inspection_notes: string;
  created_at: string;
  signed_off_at: string | null;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_USERS_RAW = [
  { username: 'sysadmin',      password: 'admin123',        full_name: 'System Administrator', employee_id: 'EMP-001',     role: 'system_admin'      as UserRole, whatsapp: '+966500000001' },
  { username: 'director1',     password: 'dir123',          full_name: 'Operations Director',   employee_id: 'EMP-005',     role: 'ops_director'      as UserRole, whatsapp: '+966500000002' },
  { username: 'ops_director1', password: 'ops_director123', full_name: 'Operations Director',   employee_id: 'EMP-DIR-001', role: 'ops_director'      as UserRole, whatsapp: '+966500000003' },
  { username: 'supervisor1',   password: 'super123',        full_name: 'Production Supervisor', employee_id: 'EMP-020',     role: 'prod_supervisor'   as UserRole, whatsapp: '+966500000004' },
  { username: 'qa1',           password: 'qa1',             full_name: 'QA Engineer One',       employee_id: 'EMP-010',     role: 'qaqc_engineer'     as UserRole, whatsapp: '+966500000005' },
  { username: 'qa2',           password: 'qa2',             full_name: 'QA Engineer Two',       employee_id: 'EMP-011',     role: 'qaqc_engineer'     as UserRole, whatsapp: '+966500000006' },
];

function mkCable(sno: number, src: string, dst: string, ferrule: string, color = 'GREY', size = '1.5SQ.mm', len = '3m', panel = 'P1'): Cable {
  const [sd, st] = src.includes(':') ? src.split(':') : [src, ''];
  const [dd, dt] = dst.includes(':') ? dst.split(':') : [dst, ''];
  return {
    sno, panel, ferrule, source_device: sd, source_terminal: st,
    source: src, destination: dst, dest_device: dd, dest_terminal: dt,
    ref: `REF-${sno.toString().padStart(3,'0')}`, color, size,
    length: len, sign: '', remarks: '', path: `${src}->${dst}`, rack: 'R1',
  };
}

const ENOWA_P1_CABLES: Cable[] = [
  mkCable(1,  '74R1:4',  '1X5C-C:18', '74R1:4/1X5C-C:18'),
  mkCable(2,  '74R1:5',  '1X5C-C:19', '74R1:5/1X5C-C:19', 'BLUE'),
  mkCable(3,  '74R1:6',  '1X5C-C:20', '74R1:6/1X5C-C:20', 'RED'),
  mkCable(4,  '78R1:1',  '2X5C-C:1',  '78R1:1/2X5C-C:1'),
  mkCable(5,  '78R1:2',  '2X5C-C:2',  '78R1:2/2X5C-C:2'),
  mkCable(6,  '78R1:3',  '2X5C-C:3',  '78R1:3/2X5C-C:3', 'BLUE', '2.5SQ.mm'),
  mkCable(7,  'K1:1',    'K2:1',      'K1:1/K2:1'),
  mkCable(8,  'K1:2',    'K2:2',      'K1:2/K2:2', 'YELLOW'),
  mkCable(9,  'K3:1',    'TB1:5',     'K3:1/TB1:5'),
  mkCable(10, 'K3:2',    'TB1:6',     'K3:2/TB1:6'),
  mkCable(11, 'X1:1',    'X2:1',      'X1:1/X2:1', 'GREEN'),
  mkCable(12, 'X1:2',    'X2:2',      'X1:2/X2:2'),
];

const ENOWA_P2_CABLES: Cable[] = [
  mkCable(1, 'CB1:1', 'TB2:1', 'CB1:1/TB2:1', 'GREY', '1.5SQ.mm', '2m', 'P2'),
  mkCable(2, 'CB1:2', 'TB2:2', 'CB1:2/TB2:2', 'BLUE', '1.5SQ.mm', '2m', 'P2'),
  mkCable(3, 'CB1:3', 'TB2:3', 'CB1:3/TB2:3', 'RED',  '1.5SQ.mm', '2m', 'P2'),
  mkCable(4, 'CB2:1', 'TB3:1', 'CB2:1/TB3:1', 'GREY', '2.5SQ.mm', '4m', 'P2'),
  mkCable(5, 'CB2:2', 'TB3:2', 'CB2:2/TB3:2', 'GREY', '2.5SQ.mm', '4m', 'P2'),
  mkCable(6, 'R1:A',  'R2:A',  'R1:A/R2:A',   'GREY', '1.5SQ.mm', '1m', 'P2'),
  mkCable(7, 'R1:B',  'R2:B',  'R1:B/R2:B',   'BLUE', '1.5SQ.mm', '1m', 'P2'),
  mkCable(8, 'R1:C',  'R2:C',  'R1:C/R2:C',   'RED',  '1.5SQ.mm', '1m', 'P2'),
];

const DEWA_P1_CABLES: Cable[] = [
  mkCable(1, 'PB1:1', 'TB1:1', 'PB1:1/TB1:1'),
  mkCable(2, 'PB1:2', 'TB1:2', 'PB1:2/TB1:2', 'BLUE'),
  mkCable(3, 'PB1:3', 'TB1:3', 'PB1:3/TB1:3', 'RED'),
  mkCable(4, 'PB2:1', 'TB2:1', 'PB2:1/TB2:1', 'GREY', '2.5SQ.mm'),
  mkCable(5, 'PB2:2', 'TB2:2', 'PB2:2/TB2:2', 'GREY', '2.5SQ.mm'),
  mkCable(6, 'PB2:3', 'TB2:3', 'PB2:3/TB2:3', 'BLUE', '2.5SQ.mm'),
  mkCable(7, 'CB1:A', 'CB2:A', 'CB1:A/CB2:A'),
  mkCable(8, 'CB1:B', 'CB2:B', 'CB1:B/CB2:B'),
  mkCable(9, 'CB1:C', 'CB2:C', 'CB1:C/CB2:C'),
  mkCable(10,'CT1:S1','TB3:1', 'CT1:S1/TB3:1', 'GREY', '4SQ.mm', '5m'),
];

// ─── In-Memory Store ──────────────────────────────────────────────────────────

export class MockStore {
  static users: User[] = [];
  static projects: Project[] = [];
  static frames: FrameData[] = [];
  static drawings: Drawing[] = [];
  static directorReports: DirectorReport[] = [];
  static techAssignments: TechAssignment[] = [];
  static sessionLogs: SessionLog[] = [];
  static fileHashes: FileHash[] = [];
  static techAuditLogs: TechAuditLog[] = [];
  static panelInspections: PanelInspection[] = [];

  private static _userId = 1;
  private static _projectId = 1;
  private static _assignId = 1;
  private static _sessionId = 1;
  private static _hashId = 1;
  private static _auditId = 1;
  private static _inspectId = 1;

  static nextUserId()   { return this._userId++; }
  static nextAssignId() { return this._assignId++; }
  static nextSessionId(){ return this._sessionId++; }
  static nextHashId()   { return this._hashId++; }
  static nextAuditId()  { return this._auditId++; }
  static nextInspectId(){ return this._inspectId++; }

  static async seed() {
    const now = new Date().toISOString();

    // ── Users
    for (const raw of SEED_USERS_RAW) {
      const hashed = await bcrypt.hash(raw.password, 10);
      this.users.push({
        id: this._userId++,
        username: raw.username,
        hashed_password: hashed,
        full_name: raw.full_name,
        employee_id: raw.employee_id,
        role: raw.role,
        is_active: true,
        created_at: now,
        last_login: null,
        whatsapp_number: raw.whatsapp,
        ready_for_assignment: false,
        ready_since: null,
      });
    }

    // ── Projects
    const projectSeeds = [
      { code: 'ENOWA_MOBILE_SUBSTATION_132KV_KSA_RIYADH_2026_001', client: 'ENOWA',
        name: 'ENOWA Mobile Substation 132KV Riyadh', state: 'active' as ProjectState,
        description: 'Mobile substation protection and control panel wiring for NEOM project', seq: 1 },
      { code: 'DEWA_132KV_PCP_UAE_DUBAI_2026_001', client: 'DEWA',
        name: 'DEWA 132KV Protection Control Panel Dubai', state: 'in_review' as ProjectState,
        description: 'Protection panel wiring for Dubai substation upgrade', seq: 1 },
      { code: 'SEWA_PCP_33KV_UAE_SHARJAH_2026_001', client: 'SEWA',
        name: 'SEWA 33KV Protection Panel Sharjah', state: 'not_started' as ProjectState,
        description: 'Distribution board protection panel installation', seq: 1 },
    ];
    for (const p of projectSeeds) {
      this.projects.push({
        id: this._projectId++, code: p.code, client: p.client, name: p.name,
        description: p.description, sequence: p.seq, is_active: true, created_at: now,
        project_state: p.state, assigned_technicians: '',
      });
    }

    // ── Frames
    const enowa = 'ENOWA_MOBILE_SUBSTATION_132KV_KSA_RIYADH_2026_001';
    const dewa  = 'DEWA_132KV_PCP_UAE_DUBAI_2026_001';

    this.frames.push({
      id: 'frame_1719100000001',
      project_code: enowa,
      panel_name: 'ENOWA MV Panel P1 — Main Protection',
      cables: ENOWA_P1_CABLES,
      uploaded_at: now,
      compare_status: 'validated',
      original_filename: 'ENOWA_WiringSchedule_P1.xlsx',
      cable_count: ENOWA_P1_CABLES.length,
      mapping: { sno: 'S.No', ferrule: 'Ferrule', source: 'Source', destination: 'Destination', color: 'Color', size: 'Size', length: 'Length' },
      sheet_name: 'Wiring Schedule',
    });

    this.frames.push({
      id: 'frame_1719100000002',
      project_code: enowa,
      panel_name: 'ENOWA MV Panel P2 — Control Circuit',
      cables: ENOWA_P2_CABLES,
      uploaded_at: now,
      compare_status: 'none',
      original_filename: 'ENOWA_WiringSchedule_P2.xlsx',
      cable_count: ENOWA_P2_CABLES.length,
      mapping: {},
      sheet_name: '',
    });

    this.frames.push({
      id: 'frame_1719100000003',
      project_code: dewa,
      panel_name: 'DEWA Protection Panel P1 — Bay 132KV',
      cables: DEWA_P1_CABLES,
      uploaded_at: now,
      compare_status: 'validated',
      original_filename: 'DEWA_WiringSchedule_P1.xlsx',
      cable_count: DEWA_P1_CABLES.length,
      mapping: { sno: 'S.No', ferrule: 'Ferrule', source: 'Source', destination: 'Destination', color: 'Color', size: 'Size' },
      sheet_name: 'Cables',
    });
  }

  // ── User helpers ─────────────────────────────────────────────────────────

  static findUserByUsername(u: string)  { return this.users.find(x => x.username === u); }
  static findUserById(id: number)       { return this.users.find(x => x.id === id); }
  static safeUser(u: User) {
    const { hashed_password: _hashed_password, ...safe } = u;
    return safe;
  }

  // ── Project helpers ──────────────────────────────────────────────────────

  static findProjectByCode(code: string) { return this.projects.find(p => p.code === code); }

  // ── Frame helpers ────────────────────────────────────────────────────────

  static findFramesByProject(code: string) { return this.frames.filter(f => f.project_code === code); }
  static findFrameById(id: string)         { return this.frames.find(f => f.id === id); }
  static findFrameByProjectAndId(code: string, id: string) {
    return this.frames.find(f => f.project_code === code && f.id === id);
  }

  // ── Assignment helpers ───────────────────────────────────────────────────

  static findAssignmentById(id: number)           { return this.techAssignments.find(a => a.id === id); }
  static findAssignmentsForTech(id: number)        { return this.techAssignments.filter(a => a.technician_id === id && !a.is_hidden); }
  static findAssignmentsForProject(code: string)   { return this.techAssignments.filter(a => a.project_code === code); }
  static findAssignmentsForFrame(code: string, frameId: string) {
    return this.techAssignments.filter(a => a.project_code === code && a.frame_id === frameId);
  }

  // ── Hash helpers ─────────────────────────────────────────────────────────

  static findHash(hash: string) { return this.fileHashes.find(h => h.file_hash === hash); }

  // ── Drawing helpers ──────────────────────────────────────────────────────

  static findDrawingsByProject(code: string) { return this.drawings.filter(d => d.project_code === code); }
  static findDrawingById(id: string)         { return this.drawings.find(d => d.id === id); }
  static findDirectorReportsByProject(code: string) { return this.directorReports.filter(d => d.project_code === code); }
  static findDirectorReportById(id: string) { return this.directorReports.find(d => d.id === id); }

  // ── Audit + session helpers ──────────────────────────────────────────────

  static logAudit(tech: User, projectCode: string, frameId: string, panelName: string, action: string, details: string) {
    this.techAuditLogs.push({
      id: this.nextAuditId(), technician_id: tech.id, technician_name: tech.full_name,
      project_code: projectCode, frame_id: frameId, panel_name: panelName,
      action, details, created_at: new Date().toISOString(),
    });
  }

  // ── Inspection helpers ───────────────────────────────────────────────────

  static findInspectionByAssignment(assignmentId: number) {
    return this.panelInspections.find(i => i.assignment_id === assignmentId);
  }
  static findInspectionById(id: number) { return this.panelInspections.find(i => i.id === id); }
  static findInspectionsByEngineer(userId: number) {
    return this.panelInspections.filter(i => i.qc_user_id === userId);
  }
  static allInspections() { return [...this.panelInspections]; }

  static logSession(userId: number, action: 'login' | 'logout' | 'server_shutdown', role: string, projectCode: string, ip: string) {
    this.sessionLogs.push({
      id: this.nextSessionId(), user_id: userId, action,
      project_code: projectCode, login_role: role,
      created_at: new Date().toISOString(), ip_address: ip,
    });
  }
}
