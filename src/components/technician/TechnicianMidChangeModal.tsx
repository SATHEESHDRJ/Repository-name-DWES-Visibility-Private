import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { techApi } from '../../services/api';
import { emitWorkflowChanged } from '../../utils/dwesRefreshEvents';
import { ArrowLeftRight, Check, Info, TriangleAlert, User } from '../ui/icons';

interface ActiveAssignment {
  id: number;
  project_code: string;
  project_name: string;
  frame_id: string;
  panel_name: string;
  technician_id: number;
  technician_name: string;
  technician_username: string;
  cables_total: number;
  cables_src_done: number;
  cables_dst_done: number;
  started_at?: string | null;
}

interface MidChangeRequest {
  requestId: string;
  sourceAssignmentId: number;
  targetAssignmentId: number;
  initiatorId: number;
  targetTechnicianId: number;
  createdAt: string;
  reason: string;
  direction: 'incoming' | 'outgoing';
  initiator_name: string;
  target_technician_name: string;
  source: { project_code: string; frame_id: string; panel_name: string; status: string } | null;
  target: { project_code: string; frame_id: string; panel_name: string; status: string } | null;
}

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

function errorMessage(error: unknown): string {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    || 'Mid Change could not be completed. Refresh and try again.';
}

export default function TechnicianMidChangeModal({ onClose, onChanged }: Props) {
  const [mine, setMine] = useState<ActiveAssignment[]>([]);
  const [candidates, setCandidates] = useState<ActiveAssignment[]>([]);
  const [requests, setRequests] = useState<MidChangeRequest[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [candidateData, requestData] = await Promise.all([
        techApi.midChangeCandidates(),
        techApi.midChangeRequests(),
      ]);
      const myRows = Array.isArray(candidateData?.my_assignments) ? candidateData.my_assignments : [];
      setMine(myRows);
      setCandidates(Array.isArray(candidateData?.candidates) ? candidateData.candidates : []);
      setRequests(Array.isArray(requestData) ? requestData : []);
      setSourceId(current => current || (myRows[0] ? String(myRows[0].id) : ''));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const incoming = requests.filter(request => request.direction === 'incoming');
  const outgoing = requests.filter(request => request.direction === 'outgoing');
  const selectedSource = mine.find(assignment => String(assignment.id) === sourceId);
  const selectedTarget = candidates.find(assignment => String(assignment.id) === targetId);
  const canRequest = Boolean(selectedSource && selectedTarget && reason.trim() && !saving && requests.length === 0);

  const targetLabel = useMemo(() => {
    if (!selectedTarget) return '';
    return `${selectedTarget.technician_name} · ${selectedTarget.project_name} · ${selectedTarget.panel_name}`;
  }, [selectedTarget]);

  const sendRequest = async () => {
    if (!canRequest || !selectedSource || !selectedTarget) return;
    setSaving(true);
    setError('');
    try {
      await techApi.requestMidChange(selectedSource.id, selectedTarget.id, reason.trim());
      setSuccess('Mid Change request sent. The other technician must confirm before either assignment changes.');
      await load();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setSaving(false);
    }
  };

  const resolveRequest = async (request: MidChangeRequest, action: 'confirm' | 'reject') => {
    setSaving(true);
    setError('');
    try {
      if (action === 'confirm') {
        await techApi.confirmMidChange(request.requestId);
        emitWorkflowChanged({ scope: 'assignment' });
        setSuccess('Mid Change confirmed. Both technicians can continue on their interchanged panels.');
        onChanged();
      } else {
        await techApi.rejectMidChange(request.requestId);
        setSuccess('Mid Change request rejected. Both assignments remain unchanged.');
      }
      await load();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setSaving(false);
    }
  };

  const footer = incoming.length > 0 || outgoing.length > 0 || success ? (
    <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Close</button>
  ) : (
    <>
      <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
      <button type="button" className="btn-primary" onClick={sendRequest} disabled={!canRequest}>
        <ArrowLeftRight size={17} />
        {saving ? 'Sending…' : 'Request Mid Change'}
      </button>
    </>
  );

  return (
    <Modal
      title="Mid Change"
      subtitle="Interchange two active technician assignments"
      icon={<ArrowLeftRight />}
      onClose={onClose}
      size="form"
      footer={footer}
      closeOnBackdrop={!saving}
      closeOnEscape={!saving}
    >
      <div className="space-y-3">
        {loading && <p className="text-[12px] text-slate-500">Loading active technicians and requests…</p>}

        {success && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] leading-5 text-emerald-800">
            <Check size={16} className="mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {!loading && incoming.map(request => (
          <section key={request.requestId} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
            <div className="mb-2 flex items-start gap-2">
              <User size={17} className="mt-0.5 shrink-0 text-blue-700" />
              <div className="min-w-0 text-[12px] leading-5 text-blue-950">
                <strong className="block whitespace-normal break-words">{request.initiator_name} requested an interchange</strong>
                <span className="block">Reason: {request.reason}</span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-blue-200 bg-white/70 p-2">
                <span className="block text-[10px] font-bold uppercase text-blue-600">You will continue on</span>
                <strong className="block whitespace-normal break-words text-[12px] leading-5 text-slate-900">{request.source?.panel_name || 'Panel unavailable'}</strong>
                <span className="block break-all text-[10px] text-slate-500">{request.source?.project_code}</span>
              </div>
              <div className="min-w-0 rounded-lg border border-blue-200 bg-white/70 p-2">
                <span className="block text-[10px] font-bold uppercase text-blue-600">They will continue on</span>
                <strong className="block whitespace-normal break-words text-[12px] leading-5 text-slate-900">{request.target?.panel_name || 'Panel unavailable'}</strong>
                <span className="block break-all text-[10px] text-slate-500">{request.target?.project_code}</span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => resolveRequest(request, 'reject')} disabled={saving}>Reject</button>
              <button type="button" className="btn-primary" onClick={() => resolveRequest(request, 'confirm')} disabled={saving}>
                <Check size={16} /> Confirm Interchange
              </button>
            </div>
          </section>
        ))}

        {!loading && outgoing.map(request => (
          <div key={request.requestId} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-5 text-amber-900">
            <Info size={16} className="mt-0.5 shrink-0" />
            <span className="min-w-0 whitespace-normal break-words">
              Awaiting confirmation from <strong>{request.target_technician_name}</strong>. No panel or progress has changed yet.
            </span>
          </div>
        ))}

        {!loading && requests.length === 0 && !success && (
          <>
            {mine.length === 0 ? (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-5 text-amber-900">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                <span>Start an assigned panel before requesting Mid Change.</span>
              </div>
            ) : (
              <>
                <label className="block">
                  <span className="form-label mb-1">Your Active Panel</span>
                  <select className="form-select" value={sourceId} onChange={event => setSourceId(event.target.value)}>
                    {mine.map(assignment => (
                      <option key={assignment.id} value={assignment.id}>{assignment.project_name} — {assignment.panel_name}</option>
                    ))}
                  </select>
                </label>
                {selectedSource && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
                    <strong className="block whitespace-normal break-words text-slate-900">{selectedSource.project_name}</strong>
                    <span className="block whitespace-normal break-words">{selectedSource.panel_name}</span>
                  </div>
                )}

                <label className="block">
                  <span className="form-label mb-1">Other Active Technician / Panel</span>
                  <select className="form-select" value={targetId} onChange={event => { setTargetId(event.target.value); setError(''); }}>
                    <option value="">Select active technician and panel…</option>
                    {candidates.map(candidate => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.technician_username || candidate.technician_name} — {candidate.panel_name}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedTarget && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600" title={targetLabel}>
                    <strong className="block whitespace-normal break-words text-slate-900">{selectedTarget.technician_name}</strong>
                    <span className="block whitespace-normal break-words">{selectedTarget.project_name}</span>
                    <span className="block whitespace-normal break-words">{selectedTarget.panel_name}</span>
                  </div>
                )}

                <label className="block">
                  <span className="form-label mb-1">Reason</span>
                  <textarea
                    className="form-input min-h-[72px] w-full resize-y"
                    value={reason}
                    onChange={event => { setReason(event.target.value); setError(''); }}
                    maxLength={120}
                    placeholder="Briefly explain why the two active assignments should be interchanged."
                  />
                </label>

                {candidates.length === 0 && (
                  <p className="text-[11px] leading-5 text-slate-500">No other technician is actively wiring a panel right now.</p>
                )}
              </>
            )}
          </>
        )}

        {error && <div className="form-error">{error}</div>}
      </div>
    </Modal>
  );
}
