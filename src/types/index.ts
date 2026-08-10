export type UserRole =
  | 'system_admin'
  | 'ops_director'
  | 'prod_supervisor'
  | 'qaqc_engineer'
  | 'wiring_technician';

export type ProjectState =
  | 'not_started' | 'active' | 'stopped' | 'pending'
  | 'wiring_started' | 'wiring_stopped' | 'completed'
  | 'completed_by_tech' | 'submitted_to_director'
  | 'report_generated' | 'in_review';

export type AssignmentStatus = 'assigned' | 'in_progress' | 'paused' | 'completed';
export type ReviewStatus = 'approved' | 'rework' | 'ready_for_qc' | null;
export type QcStatus = 'not_ready' | 'complete' | 'issues_found';

export interface AuthUser {
  id: number;
  username: string;
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

export interface BootstrapStatus {
  required: boolean;
  needs_password_rotation: boolean;
  needs_webauthn_enrollment: boolean;
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
  qc_status: QcStatus;
}

export interface Cable {
  /** Stable identity of this parsed wiring record within its panel frame. */
  record_id?: string;
  /** One-based source row in the uploaded Excel worksheet. */
  excel_row?: number;
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
  rack?: string;
  /** Original Excel cell values keyed by header name (preserved on upload). */
  _raw?: Record<string, string>;
}

export interface Frame {
  id: string;
  project_code: string;
  panel_name: string;
  cables: Cable[];
  uploaded_at: string;
  compare_status: 'none' | 'verified' | 'validated';
  original_filename: string;
  cable_count: number;
}

export interface SessionLog {
  id: number;
  user_id: number;
  action: string;
  project_code: string;
  login_role: string;
  created_at: string;
  ip_address: string;
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
  compliance_check: string;
  compliance_note: string;
  overall_result: string;
  issues: unknown[];
  inspection_notes: string;
  created_at: string;
  signed_off_at: string | null;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  system_admin: 'System Administrator',
  ops_director: 'Operations Director',
  prod_supervisor: 'Production Supervisor',
  qaqc_engineer: 'QA/QC',
  wiring_technician: 'Technician',
};

export const ROLE_ROUTES: Record<UserRole, string> = {
  system_admin: '/admin',
  ops_director: '/director',
  prod_supervisor: '/supervisor',
  qaqc_engineer: '/qaqc',
  wiring_technician: '/technician',
};

export const STATE_LABELS: Record<ProjectState, string> = {
  not_started: 'Not Started',
  active: 'Active',
  stopped: 'Stopped',
  pending: 'Pending',
  wiring_started: 'Wiring Started',
  wiring_stopped: 'Wiring Stopped',
  completed: 'Completed',
  completed_by_tech: 'Tech Completed',
  submitted_to_director: 'Submitted',
  report_generated: 'Report Ready',
  in_review: 'In Review',
};

export interface PanelActivityTechnician {
  id: number;
  name: string;
  username: string;
}

export interface PanelMidChangeActivity {
  occurred: boolean;
  changed_at: string | null;
  original_technician: PanelActivityTechnician & { cables_completed: number };
  incoming_technician: PanelActivityTechnician & { cables_completed: number };
  incoming_started: boolean;
}

export interface PanelActivityData {
  project_code: string;
  frame_id: string;
  panel_name: string;
  assigned: boolean;
  status: string;
  status_label: string;
  work_state_label: string;
  pause_reason?: string | null;
  technician: PanelActivityTechnician | null;
  assigned_at: string | null;
  wiring_started_at: string | null;
  last_activity_at: string | null;
  completed_at: string | null;
  completed_by: PanelActivityTechnician | null;
  has_started: boolean;
  is_completed: boolean;
  cables_total: number;
  cables_completed: number;
  cables_remaining: number;
  completion_percentage: number;
  mid_change: PanelMidChangeActivity | null;
}
