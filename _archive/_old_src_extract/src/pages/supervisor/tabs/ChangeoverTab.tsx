import { useEffect, useState } from 'react';
import { supervisorApi } from '../../../services/api';
import Badge from '../../../components/Badge';
import Modal from '../../../components/Modal';

export default function ChangeoverTab() {
  const [paused, setPaused] = useState<any[]>([]);
  const [readyTechs, setReadyTechs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChangeover, setShowChangeover] = useState<any>(null);

  const load = () => {
    setLoading(true);
    Promise.all([supervisorApi.pendingChangeovers(), supervisorApi.readyTechs()])
      .then(([pausedPanels, ready]) => {
        setPaused(pausedPanels);
        setReadyTechs(ready);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading changeover data...</div></div>;

  return (
    <div>
      <div className="table-toolbar">
        <div className="dwes-label">{paused.length} paused panel{paused.length !== 1 ? 's' : ''} · {readyTechs.length} technician{readyTechs.length !== 1 ? 's' : ''} ready</div>
        <button onClick={load} className="button-compact" type="button">Refresh</button>
      </div>

      {readyTechs.length > 0 && (
        <div className="changeover-ready-banner mb-md">
          <div className="changeover-ready-title">TECHNICIANS READY FOR ASSIGNMENT</div>
          <div className="changeover-ready-chips">
            {readyTechs.map(tech => (
              <span key={tech.id} className="changeover-ready-chip">{tech.full_name}</span>
            ))}
          </div>
        </div>
      )}

      {paused.length === 0 && (
        <div className="dwes-empty-state">
          <div className="dwes-empty-copy">No paused panels awaiting changeover.</div>
        </div>
      )}

      <div className="stack-grid">
        {paused.map(panel => (
          <div key={panel.id} className="changeover-card">
            <div className="changeover-main">
              <div className="changeover-title">{panel.panel_name}</div>
              <div className="changeover-meta mt-xxs">
                <span className="changeover-tech">{panel.technician_name}</span>
                <span> · {panel.project_code} · paused {panel.paused_at ? new Date(panel.paused_at).toLocaleString() : 'unknown'}</span>
              </div>
              {panel.pause_reason && <div className="changeover-reason mt-xxs">"{panel.pause_reason}"</div>}
            </div>

            <div className="changeover-progress">
              <div className="changeover-progress-value">{panel.cables_src_done}/{panel.total_cables}</div>
              <div className="changeover-progress-label">progress</div>
            </div>

            <Badge label="paused" />

            <button onClick={() => setShowChangeover(panel)} disabled={readyTechs.length === 0} className="dwes-button dwes-button-progress" type="button">
              Changeover →
            </button>
          </div>
        ))}
      </div>

      {showChangeover && (
        <ChangeoverModal
          panel={showChangeover}
          readyTechs={readyTechs}
          onClose={() => setShowChangeover(null)}
          onDone={load}
        />
      )}
    </div>
  );
}

function ChangeoverModal({ panel, readyTechs, onClose, onDone }: { panel: any; readyTechs: any[]; onClose: () => void; onDone: () => void }) {
  const [selTech, setSelTech] = useState(readyTechs[0]?.id?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleChangeover = async () => {
    if (!selTech) {
      setError('Select a technician');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await supervisorApi.changeover(panel.id, parseInt(selTech, 10));
      setDone(true);
      onDone();
    } catch (apiError: any) {
      setError(apiError?.response?.data?.message || 'Changeover failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Initiate Changeover"
      onClose={onClose}
      footer={!done ? (
        <>
          <button onClick={onClose} className="dwes-button dwes-button-neutral" type="button">Cancel</button>
          <button onClick={handleChangeover} disabled={saving} className="dwes-button dwes-button-primary" type="button">
            {saving ? 'Processing...' : 'Confirm Changeover'}
          </button>
        </>
      ) : (
        <button onClick={onClose} className="dwes-button dwes-button-primary" type="button">Done</button>
      )}
    >
      {!done ? (
        <>
          <div className="changeover-from-card mb-md">
            <div className="dwes-label mb-xxs">FROM</div>
            <div className="changeover-from-name">{panel.technician_name}</div>
            <div className="changeover-from-meta">{panel.panel_name} · {panel.cables_src_done}/{panel.total_cables} src done</div>
          </div>

          <div className="mb-md">
            <label className="dwes-label mb-xxs">NEW TECHNICIAN</label>
            <select value={selTech} onChange={event => setSelTech(event.target.value)} className="dwes-select">
              {readyTechs.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.full_name} ({tech.employee_id})</option>
              ))}
            </select>
          </div>

          <div className="changeover-warning-box">
            ⚠ The original assignment will be locked. All wiring progress is transferred to the new technician. This cannot be undone.
          </div>

          {error && <div className="dwes-error mt-sm">{error}</div>}
        </>
      ) : (
        <div className="assignment-success-wrap">
          <div className="assignment-success-icon">✅</div>
          <div className="assignment-success-title">Changeover complete!</div>
          <div className="assignment-success-copy mt-sm">Progress transferred. New assignment is pending start.</div>
        </div>
      )}
    </Modal>
  );
}
