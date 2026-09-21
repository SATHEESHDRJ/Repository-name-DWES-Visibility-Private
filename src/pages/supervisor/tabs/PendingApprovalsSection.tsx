import { useState, useEffect, useCallback } from 'react';
import { supervisorApi } from '../../../services/api';
import Badge from '../../../components/Badge';
import Modal from '../../../components/Modal';
import { RefreshCw, Check, X, ArrowRight, CheckCircle, MessageCircle, Pencil, SendHorizonal } from '../../../components/ui/icons';
import { DwesLoadingState } from '../../../components/ui/DwesLoadingIndicator';

function whatsAppReworkUrl(phone: string, panelName: string, projectCode: string, reason: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const msg = [
    'DWES — Rework Request',
    '',
    `Panel: ${panelName}`,
    `Project: ${projectCode}`,
    '',
    'Your supervisor has requested rework on this assignment before you can start wiring.',
    '',
    `Reason: ${reason}`,
  ].join('\n');
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

export default function PendingApprovalsSection() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRework, setShowRework] = useState<any>(null);
  const [reworkReason, setReworkReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return supervisorApi.pendingApprovals()
      .then(d => { setItems(d); })
      .catch(() => { if (!silent) setItems([]); })
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useEffect(() => { void load(false); }, [load]);

  const handleApprove = async (id: number) => {
    if (saving) return;
    setSaving(true);
    try {
      await supervisorApi.approve(id);
      setItems(prev => prev.filter(item => item.id !== id));
      void load(true);
    } catch (e: any) { setError(e?.response?.data?.message || 'Approval failed'); }
    finally { setSaving(false); }
  };

  const handleRework = async () => {
    if (!reworkReason.trim() || reworkReason.length < 5) { setError('Reason must be at least 5 characters'); return; }
    if (saving) return;
    setSaving(true); setError('');
    try {
      const res = await supervisorApi.rework(showRework.id, reworkReason);
      const wa = res?.technician_whatsapp || showRework.technician_whatsapp;
      const url = wa ? whatsAppReworkUrl(wa, showRework.panel_name, showRework.project_code, reworkReason) : null;
      const reworkId = showRework.id;
      setShowRework(null); setReworkReason('');
      setItems(prev => prev.filter(item => item.id !== reworkId));
      void load(true);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) { setError(e?.response?.data?.message || 'Rework request failed'); }
    finally { setSaving(false); }
  };

  return (
    <section className="mb-8">
      <div className="toolbar">
        <div>
          <h3 className="text-[15px] font-bold text-primary">Pending Approvals</h3>
          <p className="text-[12px] text-muted mt-0.5">
            Optional review for legacy assignments — technicians start directly on new assignments
          </p>
        </div>
        <button onClick={() => void load(true)} className="btn-secondary" type="button" disabled={loading && items.length === 0}>
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="form-error mb-4">{error}</div>
      )}

      {loading && items.length === 0 && (
        <DwesLoadingState label="Loading pending approvals…" />
      )}

      {!loading && items.length === 0 && (
        <div className="empty-state history-empty-state">
          <div className="history-empty-icon"><CheckCircle size={32} /></div>
          No pending approvals. All assignments are approved.
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
          {items.map(item => (
            <div key={item.id} className="h-[120px] bg-[var(--t-surface-white)] border border-[#E2E8F0] rounded-[12px] p-4 flex flex-col justify-between shadow-sm hover:bg-blue-50 hover:border-blue-200 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-[14px] font-bold text-primary truncate" title={item.panel_name}>{item.panel_name}</span>
                  <span className="text-[12px] font-medium text-muted truncate mt-0.5 flex items-center gap-1">
                    {item.technician_name} <ArrowRight size={10} className="text-slate-400" /> {item.project_code}
                    {item.technician_whatsapp && (
                      <span className="text-green-600 text-[10px] ml-1" title={item.technician_whatsapp}>☎ WA</span>
                    )}
                  </span>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-[18px] font-bold text-primary leading-none">{item.total_cables || 0}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cables</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Badge label="pending" />
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowRework(item); setReworkReason(''); setError(''); }}
                    className="flex items-center justify-center h-[36px] px-3 bg-[var(--t-surface-white)] border border-[#E2E8F0] text-muted rounded-[8px] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors text-[13px] font-bold" type="button">
                    <X size={16} strokeWidth={2} className="mr-1" />
                    Request Changes
                  </button>
                  <button onClick={() => handleApprove(item.id)} disabled={saving}
                    className="flex items-center justify-center h-[36px] px-3 bg-green-600 text-white rounded-[8px] hover:bg-green-700 transition-colors text-[13px] font-bold disabled:opacity-50" type="button">
                    <Check size={16} strokeWidth={2} className="mr-1" />
                    Approve
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showRework && (
        <Modal title="Request Changes" icon={<Pencil />} iconTone="warning" onClose={() => setShowRework(null)}
          footer={<>
            <button onClick={() => setShowRework(null)} className="btn-secondary" type="button">Cancel</button>
            <button onClick={handleRework} disabled={saving} className="btn-danger" type="button">
              <SendHorizonal size={16} />
              {saving ? 'Sending…' : 'Send Request'}
            </button>
          </>}>
          <div className="approval-modal-copy mb-4 flex items-center gap-1">
            Assignment: <span className="approval-modal-strong">{showRework.panel_name}</span> <ArrowRight size={14} className="text-slate-400" /> {showRework.technician_name}
          </div>
          <div>
            <label className="form-label mb-1">
              Reason (min 5 chars)
            </label>
            <div className="field-with-icon field-with-icon--top">
              <span className="field-lead-icon"><MessageCircle size={18} /></span>
              <textarea value={reworkReason} onChange={e => setReworkReason(e.target.value)} rows={3}
                placeholder="Describe what needs to change before wiring can start…"
                className="form-textarea" />
            </div>
            {showRework.technician_whatsapp && (
              <p className="text-[12px] text-muted mt-2 flex items-center gap-1">
                <MessageCircle size={14} className="text-green-600" />
                WhatsApp notify will open for {showRework.technician_whatsapp} after sending.
              </p>
            )}
          </div>
          {error && <div className="form-error mt-2">{error}</div>}
        </Modal>
      )}
    </section>
  );
}
