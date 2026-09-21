import { useState, useEffect } from 'react';
import { qaqcApi } from '../../../services/api';
import Modal from '../../../components/Modal';

export default function HistoryTab() {
  const [inspections, setInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'PASS' | 'FAIL' | 'CONDITIONAL_PASS'>('all');
  const [selected, setSelected] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    qaqcApi.allInspections().then(d => { setInspections(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? inspections : inspections.filter(i => i.overall_result === filter);

  const openDetail = async (i: any) => {
    setDetailLoading(true);
    setSelected(i);
    try {
      const d = await qaqcApi.getInspection(i.id);
      setSelected(d);
    } catch { setSelected(i); }
    finally { setDetailLoading(false); }
  };

  const resultTone = (value: string) => {
    if (value === 'PASS') return 'pass';
    if (value === 'FAIL') return 'fail';
    return 'conditional';
  };

  return (
    <div>
      <div className="history-filter-row">
        {(['all', 'PASS', 'CONDITIONAL_PASS', 'FAIL'] as const).map(f => {
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`history-filter-btn ${filter === f ? 'is-active' : ''}`}
              data-tone={f === 'all' ? 'all' : resultTone(f)}
              type="button"
            >
              {f === 'all' ? 'All' : f === 'CONDITIONAL_PASS' ? 'Conditional' : f.charAt(0) + f.slice(1).toLowerCase()}
              {f !== 'all' && (
                <span className="history-filter-count">
                  ({inspections.filter(i => i.overall_result === f).length})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading && <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading history...</div></div>}

      {!loading && filtered.length === 0 && (
        <div className="dwes-empty-state history-empty-state">
          <div className="history-empty-icon">📋</div>
          <div className="dwes-empty-copy">No inspection records found</div>
        </div>
      )}

      <div className="history-list">
        {filtered.map(i => {
          return (
            <div key={i.id} className="history-item" data-tone={resultTone(i.overall_result)}>
              <div className="history-item-main">
                <div className="history-item-title">{i.panel_name}</div>
                <div className="history-item-copy mt-xxs">
                  {i.project_code} · Technician: {i.technician_name}
                </div>
                <div className="history-item-meta mt-xxs">
                  Inspector: {i.inspector_name} · {new Date(i.created_at).toLocaleString()}
                </div>
              </div>

              <div className="history-issues">
                <div>{(i.issues || []).length} issues</div>
              </div>

              <span className="history-result-pill" data-tone={resultTone(i.overall_result)}>
                {i.overall_result === 'CONDITIONAL_PASS' ? 'CONDITIONAL' : i.overall_result}
              </span>

              <button onClick={() => openDetail(i)} className="button-compact" type="button">
                View
              </button>
            </div>
          );
        })}
      </div>

      {selected && (
        <Modal title={`Inspection — ${selected.panel_name}`} onClose={() => setSelected(null)} width={620}>
          {detailLoading ? (
            <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading...</div></div>
          ) : (
            <div className="history-modal-body">
              <div className="history-modal-result-wrap">
                <div className="history-modal-result" data-tone={resultTone(selected.overall_result)}>
                  {selected.overall_result === 'CONDITIONAL_PASS' ? 'CONDITIONAL PASS' : selected.overall_result}
                </div>
              </div>

              <div className="history-modal-meta-grid">
                {[
                  ['Panel', selected.panel_name],
                  ['Project', selected.project_code],
                  ['Technician', selected.technician_name],
                  ['Inspector', selected.inspector_name],
                  ['Date', new Date(selected.created_at).toLocaleString()],
                  ['Sign-off', selected.signed_off_at ? new Date(selected.signed_off_at).toLocaleString() : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="history-meta-card">
                    <div className="history-meta-label">{k}</div>
                    <div className="history-meta-value mt-xxs">{v}</div>
                  </div>
                ))}
              </div>

              <div className="history-section">
                <div className="history-section-label">Inspection Checks</div>
                <div className="history-check-grid">
                  {[
                    { label: 'Visual', val: selected.visual_check, note: selected.visual_note },
                    { label: 'Labeling', val: selected.labeling_check, note: selected.labeling_note },
                    { label: 'Ferrule', val: selected.ferrule_check, note: selected.ferrule_note },
                    { label: 'Compliance', val: selected.compliance_check, note: selected.compliance_note },
                  ].map(c => {
                    return (
                      <div key={c.label} className="history-check-card" data-tone={c.val === 'pass' ? 'pass' : 'fail'}>
                        <div className="history-check-row">
                          <span className="history-check-label">{c.label}</span>
                          <span className="history-check-value" data-tone={c.val === 'pass' ? 'pass' : 'fail'}>{(c.val || '').toUpperCase()}</span>
                        </div>
                        {c.note && <div className="history-check-note mt-xxs">{c.note}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="history-redmarkup">
                <div className="history-section-label mb-0">Red Markup</div>
                <div className={`history-redmarkup-value ${selected.redmarkup_check === 'none' ? 'tone-pass' : selected.redmarkup_check === 'minor' ? 'tone-warning' : 'tone-fail'}`}>
                  {selected.redmarkup_check === 'none' ? 'None' : selected.redmarkup_check === 'minor' ? 'Minor Corrections' : 'Major Corrections'}
                </div>
                {selected.redmarkup_note && <div className="history-redmarkup-note mt-xxs">{selected.redmarkup_note}</div>}
              </div>

              {selected.issues?.length > 0 && (
                <div className="history-section">
                  <div className="history-section-label">Issues ({selected.issues.length})</div>
                  {selected.issues.map((iss: any) => (
                    <div key={iss.id} className="history-issue-row" data-severity={iss.severity}>
                      <div className="history-issue-head">
                        <span className="history-issue-severity" data-severity={iss.severity}>{iss.severity}</span>
                        <span className="history-issue-desc">{iss.description}</span>
                      </div>
                      {iss.location && <div className="history-issue-location mt-xxs">📍 {iss.location}</div>}
                    </div>
                  ))}
                </div>
              )}

              {selected.inspection_notes && (
                <div className="history-notes-box">
                  <div className="history-section-label mb-0">Notes</div>
                  <div className="history-notes-copy mt-xxs">{selected.inspection_notes}</div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
