import { useState, useEffect } from 'react';
import { supervisorApi } from '../../../services/api';
import Badge from '../../../components/Badge';
import Modal from '../../../components/Modal';

export default function ApprovalTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRework, setShowRework] = useState<any>(null);
  const [reworkReason, setReworkReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    supervisorApi.pendingApprovals().then(d => { setItems(d); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const handleApprove = async (id: number) => {
    setSaving(true);
    try {
      await supervisorApi.approve(id);
      load();
    } catch (e: any) { setError(e?.response?.data?.message || 'Approval failed'); }
    finally { setSaving(false); }
  };

  const handleRework = async () => {
    if (!reworkReason.trim() || reworkReason.length < 5) { setError('Reason must be at least 5 characters'); return; }
    setSaving(true); setError('');
    try {
      await supervisorApi.rework(showRework.id, reworkReason);
      setShowRework(null); setReworkReason('');
      load();
    } catch (e: any) { setError(e?.response?.data?.message || 'Rework request failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading pending approvals...</div></div>;

  return (
    <div>
      <div className="table-toolbar">
        <div className="dwes-label">
          {items.length} pending approval{items.length !== 1 ? 's' : ''}
        </div>
        <button onClick={load} className="button-compact" type="button">
          Refresh
        </button>
      </div>

      {error && (
        <div className="dwes-error mb-md">{error}</div>
      )}

      {items.length === 0 && (
        <div className="dwes-empty-state history-empty-state">
          <div className="history-empty-icon">✓</div>
          No pending approvals. All assignments are approved.
        </div>
      )}

      <div className="stack-grid">
        {items.map(item => (
          <div key={item.id} className="approval-card">
            <div className="approval-main">
              <div className="approval-title">{item.panel_name}</div>
              <div className="approval-route mt-xxs">
                {item.technician_name} <span className="approval-arrow">→</span> {item.project_code}
              </div>
              <div className="approval-time mt-xxs">
                Assigned {new Date(item.assigned_at).toLocaleString()}
              </div>
            </div>

            <div className="approval-cables">
              <div className="approval-cables-value">{item.total_cables || 0}</div>
              <div className="approval-cables-label">cables</div>
            </div>

            <Badge label="pending" />

            <div className="touch-action-row">
              <button onClick={() => handleApprove(item.id)} disabled={saving}
                className="dwes-button dwes-button-success button-compact-cta" type="button">
                ✓ Approve
              </button>
              <button onClick={() => { setShowRework(item); setReworkReason(''); setError(''); }}
                className="dwes-button dwes-button-danger button-compact-cta" type="button">
                ✗ Rework
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Rework modal */}
      {showRework && (
        <Modal title="Request Rework" onClose={() => setShowRework(null)}
          footer={<>
            <button onClick={() => setShowRework(null)} className="dwes-button dwes-button-neutral" type="button">Cancel</button>
            <button onClick={handleRework} disabled={saving} className="dwes-button dwes-button-danger" type="button">
              {saving ? 'Sending…' : 'Send Rework Request'}
            </button>
          </>}>
          <div className="approval-modal-copy mb-md">
            Assignment: <span className="approval-modal-strong">{showRework.panel_name}</span> → {showRework.technician_name}
          </div>
          <div>
            <label className="dwes-label mb-xxs">
              Reason (min 5 chars)
            </label>
            <textarea value={reworkReason} onChange={e => setReworkReason(e.target.value)} rows={3}
              placeholder="Describe what needs to be reworked…"
              className="dwes-textarea" />
          </div>
          {error && <div className="dwes-error mt-sm">{error}</div>}
        </Modal>
      )}
    </div>
  );
}
