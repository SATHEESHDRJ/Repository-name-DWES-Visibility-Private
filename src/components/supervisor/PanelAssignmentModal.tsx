import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { projectsApi, supervisorApi, usersApi } from '../../services/api';
import { emitWorkflowChanged } from '../../utils/dwesRefreshEvents';
import type { FramePanel } from '../assignment/ProjectPanelSelect';
import TechnicianSelect from '../assignment/TechnicianSelect';
import type { AssignmentRow, TechUser } from '../../utils/assignmentCenterUtils';
import { CheckCircle, TriangleAlert, UserPlus } from '../ui/icons';

/** Kept for compatibility with callers; supervisor workflow now performs initial assignment only. */
export type TechnicianWorkflowSection = 'assign' | 'deassign' | 'changeover';

export interface TechnicianWorkflowModalProps {
  onClose: () => void;
  initialSection?: TechnicianWorkflowSection;
  projectCode: string;
  panelId: string;
  projectName: string;
  panelName: string;
  cableCount?: number;
}

type TechnicianOption = TechUser & {
  availability_status?: 'AVAILABLE' | 'ASSIGNED';
};

function messageFrom(error: unknown): string {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    || 'The technician could not be assigned. Please refresh and try again.';
}

export default function PanelAssignmentModal({
  onClose,
  projectCode,
  panelId,
  projectName,
  panelName,
  cableCount = 0,
}: TechnicianWorkflowModalProps) {
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [panel, setPanel] = useState<FramePanel | null>(null);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [assignedName, setAssignedName] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      usersApi.technicians(),
      supervisorApi.allPanels(),
      projectsApi.frames(projectCode),
    ]).then(([techRows, assignmentRows, panels]) => {
      if (!active) return;
      setTechnicians(Array.isArray(techRows) ? techRows : []);
      setAssignments(Array.isArray(assignmentRows) ? assignmentRows : []);
      const panelRows = Array.isArray(panels) ? panels as FramePanel[] : [];
      setPanel(panelRows.find(item => item.id === panelId) ?? null);
    }).catch(loadError => {
      if (active) setError(messageFrom(loadError));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [panelId, projectCode]);

  const activeAssignments = useMemo(
    () => assignments.filter(assignment => (
      ['assigned', 'in_progress', 'paused'].includes(String(assignment.status || ''))
      && !assignment.changeover_locked
    )),
    [assignments],
  );
  const panelAssignment = activeAssignments.find(assignment => (
    assignment.project_code === projectCode && assignment.frame_id === panelId
  ));
  const assignedTechnicianIds = new Set(activeAssignments.map(assignment => assignment.technician_id));
  const selectedTechnician = technicians.find(technician => String(technician.id) === selectedTechnicianId);
  const availableTechnicianCount = technicians.filter(technician => (
    !assignedTechnicianIds.has(technician.id) && technician.availability_status !== 'ASSIGNED'
  )).length;
  const assignedTechnicianCount = technicians.length - availableTechnicianCount;
  const resolvedPanelName = panel?.panel_name || panelName || panelId;
  const resolvedCableCount = Number(panel?.cable_count ?? cableCount ?? 0);
  const scheduleReady = resolvedCableCount > 0;
  const canAssign = Boolean(
    selectedTechnician
    && !assignedTechnicianIds.has(selectedTechnician.id)
    && !panelAssignment
    && scheduleReady
    && !saving,
  );

  const assignTechnician = async () => {
    if (!canAssign || !selectedTechnician) return;
    setSaving(true);
    setError('');
    try {
      await supervisorApi.assignFrame({
        project_code: projectCode,
        frame_id: panelId,
        technician_id: selectedTechnician.id,
      });
      setAssignedName(selectedTechnician.full_name || selectedTechnician.username || `Tech #${selectedTechnician.id}`);
      emitWorkflowChanged({ scope: 'assignment', projectCode, frameId: panelId });
    } catch (actionError) {
      setError(messageFrom(actionError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Assign Technician"
      subtitle={`${projectName || projectCode} · ${resolvedPanelName}`}
      icon={<UserPlus />}
      onClose={onClose}
      size="lg"
      bodyClassName="assign-technician-modal-body"
      closeOnBackdrop={!saving}
      closeOnEscape={!saving}
      footer={assignedName ? (
        <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            type="button"
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
            onClick={assignTechnician}
            disabled={!canAssign}
          >
            <UserPlus size={17} />
            {saving ? 'Assigning…' : 'Assign Technician'}
          </button>
        </>
      )}
    >
      <div className="assign-technician-shell">
        <section className="assign-technician-context" aria-label="Selected project and panel">
          <div className="assign-technician-context-item">
              <span className="assign-technician-context-label">Project Name</span>
              <strong className="assign-technician-context-value" title={projectName || projectCode}>
                {projectName || projectCode}
              </strong>
              <span className="assign-technician-context-meta" title={projectCode}>{projectCode}</span>
          </div>
          <div className="assign-technician-context-item">
              <span className="assign-technician-context-label">Panel Name</span>
              <strong className="assign-technician-context-value" title={resolvedPanelName}>
                {resolvedPanelName}
              </strong>
              <span className="assign-technician-context-meta">{resolvedCableCount} assigned cables</span>
          </div>
        </section>

        {loading && <p className="assign-technician-loading">Loading technician availability…</p>}

        {!loading && panelAssignment && (
          <div className="assign-technician-notice" role="status">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span>This panel already has an active technician assignment. Mid Change is available only from the Technician Dashboard.</span>
          </div>
        )}

        {!loading && !scheduleReady && (
          <div className="assign-technician-notice" role="status">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span>Upload the panel wiring schedule before assigning a technician.</span>
          </div>
        )}

        {!assignedName && (
          <section className="assign-technician-picker" aria-labelledby="assign-technician-list-heading">
            <div className="assign-technician-picker-header">
              <div>
                <h3 id="assign-technician-list-heading">Technicians</h3>
                <p>Select one available technician for this panel.</p>
              </div>
              <div className="assign-technician-counts" aria-label="Technician availability summary">
                <span className="is-available"><i aria-hidden="true" />{availableTechnicianCount} available</span>
                <span className="is-assigned"><i aria-hidden="true" />{assignedTechnicianCount} assigned</span>
              </div>
            </div>
            <TechnicianSelect
              options={technicians.map(technician => ({
                id: technician.id,
                name: technician.full_name || technician.username || `Tech #${technician.id}`,
                username: technician.username,
                assigned: assignedTechnicianIds.has(technician.id)
                  || technician.availability_status === 'ASSIGNED',
              }))}
              value={selectedTechnicianId}
              onChange={id => { setSelectedTechnicianId(id); setError(''); }}
              disabled={loading || Boolean(panelAssignment) || !scheduleReady}
              inlineList
            />
          </section>
        )}

        {assignedName && (
          <div className="assign-technician-success">
            <CheckCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <strong>{assignedName}</strong>
              <span>was assigned to {resolvedPanelName}. The panel is now available on the technician dashboard.</span>
            </div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
      </div>
    </Modal>
  );
}
