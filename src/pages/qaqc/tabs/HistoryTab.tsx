import { useState, useEffect } from 'react';
import { qaqcApi } from '../../../services/api';
import { useCallback } from 'react';
import Modal from '../../../components/Modal';
import { Eye, ClipboardList, MapPin } from '../../../components/ui/icons';
import { useLatestRequest } from '../../../hooks/useLatestRequest';
import { useDwesRefresh, type RefreshOptions } from '../../../hooks/useDwesRefresh';
import { onFramesChanged } from '../../../utils/projectFramesEvents';

export default function HistoryTab() {
  const [inspections, setInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'PASS' | 'FAIL' | 'CONDITIONAL_PASS'>('all');
  const [selected, setSelected] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const listRequests = useLatestRequest();
  const detailRequests = useLatestRequest();

  const load = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent === true;
    const request = listRequests.begin();
    if (!silent) setLoading(true);
    if (!silent) setInspections([]);
    try {
      const rows = await qaqcApi.allInspections(request.signal);
      if (listRequests.isLatest(request.id)) setInspections(rows);
    } catch { /* authoritative empty loading state remains */ }
    finally { if (listRequests.isLatest(request.id)) setLoading(false); }
  }, [listRequests]);

  useEffect(() => { void load(); }, [load]);
  useDwesRefresh(load);

  useEffect(() => onFramesChanged(detail => {
    if (detail.action !== 'deleted') return;
    listRequests.cancel();
    detailRequests.cancel();
    setInspections(current => current.filter(inspection => (
      inspection.project_code !== detail.projectCode
      || (!!detail.frameId && inspection.frame_id !== detail.frameId)
    )));
    setSelected((current: any | null) => current?.project_code === detail.projectCode
      && (!detail.frameId || current.frame_id === detail.frameId)
      ? null
      : current);
  }), [detailRequests, listRequests]);

  const filtered = filter === 'all' ? inspections : inspections.filter(i => i.overall_result === filter);

  const openDetail = async (i: any) => {
    const request = detailRequests.begin();
    setDetailLoading(true);
    setSelected(i);
    try {
      const d = await qaqcApi.getInspection(i.id, request.signal);
      if (detailRequests.isLatest(request.id)) setSelected(d);
    } catch (error: any) {
      if (error?.code !== 'ERR_CANCELED' && detailRequests.isLatest(request.id)) setSelected(null);
    }
    finally { if (detailRequests.isLatest(request.id)) setDetailLoading(false); }
  };

  const resultBadge = (value: string) => {
    if (value === 'PASS') return 'badge-green';
    if (value === 'FAIL') return 'badge-red';
    return 'badge-amber';
  };

  const checkBadge = (val: string) => val === 'pass' ? 'badge-green' : 'badge-red';

  const severityBadge = (sev: string) => {
    if (sev === 'critical') return 'badge-red';
    if (sev === 'major') return 'badge-orange';
    return 'badge-amber';
  };

  const FILTER_TABS = [
    { value: 'all' as const, label: 'All' },
    { value: 'PASS' as const, label: 'Pass' },
    { value: 'CONDITIONAL_PASS' as const, label: 'Conditional' },
    { value: 'FAIL' as const, label: 'Fail' },
  ];

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTER_TABS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            type="button"
            className={`tab-btn ${filter === f.value ? 'active' : ''}`}
          >
            {f.label}
            {f.value !== 'all' && (
              <span className="ml-1 text-[10px] bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5 font-bold">
                {inspections.filter(i => i.overall_result === f.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="empty-state"><p className="empty-text">Loading history...</p></div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <ClipboardList size={40} className="text-slate-300" strokeWidth={1.5} />
          <p className="empty-text">No inspection records found</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map(i => (
          <div key={i.id} className="flex items-center gap-4 p-4 bg-[var(--t-surface-white)] border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{i.panel_name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{i.project_code} · Technician: {i.technician_name}</div>
              <div className="text-xs text-slate-400 mt-0.5">Inspector: {i.inspector_name} · {new Date(i.created_at).toLocaleString()}</div>
            </div>
            <div className="text-xs text-slate-500 shrink-0">{(i.issues || []).length} issues</div>
            <span className={resultBadge(i.overall_result)}>
              {i.overall_result === 'CONDITIONAL_PASS' ? 'CONDITIONAL' : i.overall_result}
            </span>
            <button
              onClick={() => openDetail(i)}
              className="btn-icon"
              type="button"
              title="View Inspection"
            >
              <Eye size={18} strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <Modal title={`Inspection — ${selected.panel_name}`} onClose={() => setSelected(null)} size="lg">
          {detailLoading ? (
            <div className="empty-state"><p className="empty-text">Loading...</p></div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Result pill */}
              <div className="flex justify-center">
                <span className={`text-base font-bold px-6 py-2 rounded-full ${
                  selected.overall_result === 'PASS' ? 'bg-green-100 text-green-700' :
                  selected.overall_result === 'FAIL' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'}`}>
                  {selected.overall_result === 'CONDITIONAL_PASS' ? 'CONDITIONAL PASS' : selected.overall_result}
                </span>
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-2 tablet-land:grid-cols-3 gap-3">
                {[
                  ['Panel', selected.panel_name],
                  ['Project', selected.project_code],
                  ['Technician', selected.technician_name],
                  ['Inspector', selected.inspector_name],
                  ['Date', new Date(selected.created_at).toLocaleString()],
                  ['Sign-off', selected.signed_off_at ? new Date(selected.signed_off_at).toLocaleString() : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="bg-slate-50 rounded-xl p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k}</div>
                    <div className="text-sm font-medium text-slate-800 mt-0.5">{v}</div>
                  </div>
                ))}
              </div>

              {/* Inspection checks */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Inspection Checks</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Visual', val: selected.visual_check, note: selected.visual_note },
                    { label: 'Labeling', val: selected.labeling_check, note: selected.labeling_note },
                    { label: 'Ferrule', val: selected.ferrule_check, note: selected.ferrule_note },
                    { label: 'Compliance', val: selected.compliance_check, note: selected.compliance_note },
                  ].map(c => (
                    <div key={c.label} className={`rounded-xl p-3 border ${c.val === 'pass' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">{c.label}</span>
                        <span className={checkBadge(c.val)}>{(c.val || '').toUpperCase()}</span>
                      </div>
                      {c.note && <div className="text-xs text-slate-500 mt-1">{c.note}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Red markup */}
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Red Markup</div>
                <div className={`text-sm font-semibold ${
                  selected.redmarkup_check === 'none' ? 'text-green-700' :
                  selected.redmarkup_check === 'minor' ? 'text-amber-700' : 'text-red-700'}`}>
                  {selected.redmarkup_check === 'none' ? 'None' :
                   selected.redmarkup_check === 'minor' ? 'Minor Corrections' : 'Major Corrections'}
                </div>
                {selected.redmarkup_note && <div className="text-xs text-slate-500 mt-0.5">{selected.redmarkup_note}</div>}
              </div>

              {/* Issues */}
              {selected.issues?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Issues ({selected.issues.length})
                  </div>
                  <div className="flex flex-col gap-2">
                    {selected.issues.map((iss: any) => (
                      <div key={iss.id} className="flex flex-col gap-1 p-3 bg-[var(--t-surface-white)] border border-slate-200 rounded-xl">
                        <div className="flex items-center gap-2">
                          <span className={severityBadge(iss.severity)}>{iss.severity}</span>
                          <span className="text-sm text-slate-700">{iss.description}</span>
                        </div>
                        {iss.location && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <MapPin size={14} className="text-slate-400" />
                            <span>{iss.location}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selected.inspection_notes && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Notes</div>
                  <div className="text-sm text-slate-700">{selected.inspection_notes}</div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
