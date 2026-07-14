import { useState, useEffect } from 'react';
import { qaqcApi } from '../../../services/api';
import { useCallback } from 'react';
import { emitWorkflowChanged } from '../../../utils/dwesRefreshEvents';
import { AlertTriangle, Check, X, Search, Plus } from '../../../components/ui/icons';
import { useLatestRequest } from '../../../hooks/useLatestRequest';
import { useDwesRefresh, type RefreshOptions } from '../../../hooks/useDwesRefresh';

interface InspectionFormTabProps {
  panel: any | null;
  onInspectionDone: () => void;
  onUnavailable: () => void;
}

type CheckVal = 'pass' | 'fail';
type MarkupVal = 'none' | 'minor' | 'major';
type Result = 'PASS' | 'FAIL' | 'CONDITIONAL_PASS';

interface Issue {
  id: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  location: string;
  resolved: boolean;
}

const CHECK_LABEL: Record<CheckVal, React.ReactNode> = { 
  pass: <><span className="flex items-center gap-1">PASS <Check size={14} /></span></>, 
  fail: <><span className="flex items-center gap-1">FAIL <X size={14} /></span></> 
};

function CheckRow({ label, value, onChange, note, onNoteChange, disabled }: {
  label: string;
  value: CheckVal;
  onChange: (v: CheckVal) => void;
  note: string;
  onNoteChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 p-5 bg-[var(--t-surface-white)] border border-[#E2E8F0] rounded-[12px] shadow-sm mb-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-[14px] font-bold text-slate-800">{label}</div>
        <div className="flex items-center gap-2 shrink-0">
          {(['pass', 'fail'] as CheckVal[]).map(v => (
            <button
              key={v}
              disabled={disabled}
              onClick={() => !disabled && onChange(v)}
              className={`flex items-center justify-center h-[44px] px-6 rounded-[10px] text-[13px] font-bold transition-colors border ${
                value === v 
                  ? v === 'pass' ? 'bg-green-600 border-green-600 text-white' : 'bg-red-600 border-red-600 text-white'
                  : 'bg-[var(--t-surface-white)] border-[#E2E8F0] text-slate-600 hover:bg-slate-50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              type="button"
            >
              {CHECK_LABEL[v]}
            </button>
          ))}
        </div>
      </div>
      <input
        value={note}
        onChange={e => !disabled && onNoteChange(e.target.value)}
        disabled={disabled}
        placeholder="Notes (optional)..."
        className="form-input disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

export default function InspectionFormTab({ panel, onInspectionDone, onUnavailable }: InspectionFormTabProps) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [visual, setVisual] = useState<CheckVal>('pass');
  const [visualNote, setVisualNote] = useState('');
  const [markup, setMarkup] = useState<MarkupVal>('none');
  const [markupNote, setMarkupNote] = useState('');
  const [labeling, setLabeling] = useState<CheckVal>('pass');
  const [labelingNote, setLabelingNote] = useState('');
  const [ferrule, setFerrule] = useState<CheckVal>('pass');
  const [ferruleNote, setFerruleNote] = useState('');
  const [compliance, setCompliance] = useState<CheckVal>('pass');
  const [complianceNote, setComplianceNote] = useState('');
  const [inspNotes, setInspNotes] = useState('');
  const [result, setResult] = useState<Result>('PASS');
  const [issues, setIssues] = useState<Issue[]>([]);

  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueSev, setIssueSev] = useState<Issue['severity']>('minor');
  const [issueDesc, setIssueDesc] = useState('');
  const [issueLoc, setIssueLoc] = useState('');
  const requests = useLatestRequest();

  const loadDetail = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent === true;
    if (!panel) {
      if (!silent) setDetail(null);
      return;
    }
    const request = requests.begin();
    if (!silent) {
      setLoading(true);
      setDetail(null);
      setSaved(false);
      setError('');
    }
    try {
      const d = await qaqcApi.panelDetail(panel.id, request.signal);
      if (!requests.isLatest(request.id)) return;
      setDetail(d);
      // A background refresh updates the read-only panel detail only. Re-seeding the
      // check/note/issue fields here would discard an inspection the engineer is typing.
      if (silent) return;
      if (d.existing_inspection) {
        const i = d.existing_inspection;
        setVisual(i.visual_check || 'pass');
        setVisualNote(i.visual_note || '');
        setMarkup(i.redmarkup_check || 'none');
        setMarkupNote(i.redmarkup_note || '');
        setLabeling(i.labeling_check || 'pass');
        setLabelingNote(i.labeling_note || '');
        setFerrule(i.ferrule_check || 'pass');
        setFerruleNote(i.ferrule_note || '');
        setCompliance(i.compliance_check || 'pass');
        setComplianceNote(i.compliance_note || '');
        setInspNotes(i.inspection_notes || '');
        setResult(i.overall_result || 'PASS');
        setIssues(i.issues || []);
      } else {
        setVisual('pass');
        setVisualNote('');
        setMarkup('none');
        setMarkupNote('');
        setLabeling('pass');
        setLabelingNote('');
        setFerrule('pass');
        setFerruleNote('');
        setCompliance('pass');
        setComplianceNote('');
        setInspNotes('');
        setResult('PASS');
        if (!silent) setIssues([]);
      }
    } catch (requestError: any) {
      if (requestError?.code === 'ERR_CANCELED' || !requests.isLatest(request.id)) return;
      if (!silent) setDetail(null);
      if (requestError?.response?.status === 404) onUnavailable();
    } finally {
      if (requests.isLatest(request.id)) setLoading(false);
    }
  }, [onUnavailable, panel, requests]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);
  useDwesRefresh(loadDetail);

  const addIssue = () => {
    if (!issueDesc.trim()) return;
    setIssues(prev => [...prev, {
      id: Date.now().toString(),
      severity: issueSev,
      description: issueDesc.trim(),
      location: issueLoc.trim(),
      resolved: false,
    }]);
    setIssueDesc('');
    setIssueLoc('');
    setShowIssueForm(false);
  };

  const removeIssue = (id: string) => setIssues(prev => prev.filter(i => i.id !== id));

  const handleSubmit = async () => {
    if (!panel) return;
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    if (criticalCount > 0 && result === 'PASS') {
      setError('Cannot mark PASS with critical issues. Use FAIL or CONDITIONAL PASS.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await qaqcApi.inspect(panel.id, {
        visual_check: visual,
        visual_note: visualNote,
        redmarkup_check: markup,
        redmarkup_note: markupNote,
        labeling_check: labeling,
        labeling_note: labelingNote,
        ferrule_check: ferrule,
        ferrule_note: ferruleNote,
        compliance_check: compliance,
        compliance_note: complianceNote,
        issues,
        inspection_notes: inspNotes,
        overall_result: result,
      });
      emitWorkflowChanged({ scope: 'inspection', projectCode: panel.project_code, frameId: panel.id });
      setSaved(true);
      onInspectionDone();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to submit inspection');
    } finally {
      setSaving(false);
    }
  };

  if (!panel) {
    return (
      <div className="qaqc-empty-select">
        <div className="qaqc-empty-icon"><Search size={32} /></div>
        <div className="qaqc-empty-title">No panel selected</div>
        <div className="qaqc-empty-copy">Click "Inspect Panel" from the Panels tab to start an inspection.</div>
      </div>
    );
  }

  if (loading) return <div className="empty-state"><p className="empty-text">Loading panel details...</p></div>;

  const isReInspect = !!detail?.existing_inspection;

  const stats = [
    { label: 'KPI', val: `${panel.kpi}%`, tone: 'progress' },
    { label: 'Cables', val: panel.cables_total, tone: 'muted' },
    { label: 'Src Done', val: `${panel.cables_src_done}/${panel.cables_total}`, tone: 'completed' },
    { label: 'Dst Done', val: `${panel.cables_dst_done}/${panel.cables_total}`, tone: 'progress' },
  ];

  const resultOptions: { val: Result; label: string; tone: 'completed' | 'warning' | 'danger'; desc: string }[] = [
    { val: 'PASS', label: 'PASS', tone: 'completed', desc: 'All checks passed, no issues' },
    { val: 'CONDITIONAL_PASS', label: 'CONDITIONAL', tone: 'warning', desc: 'Minor issues, can proceed with conditions' },
    { val: 'FAIL', label: 'FAIL', tone: 'danger', desc: 'Critical issues, rework required' },
  ];

  const critCount = issues.filter(i => i.severity === 'critical').length;
  const majCount = issues.filter(i => i.severity === 'major').length;
  const hasFailCheck = [visual, labeling, ferrule, compliance].includes('fail');
  const suggested: Result = critCount > 0 || hasFailCheck ? 'FAIL' : majCount > 0 || markup === 'major' ? 'CONDITIONAL_PASS' : 'PASS';

  return (
    <div>
      <div className="qaqc-head-card mb-6">
        <div className="qaqc-head-row">
          <div>
            <div className="qaqc-head-title">{panel.panel_display_name || panel.panel_name}</div>
            <div className="qaqc-head-sub mt-1">{panel.project_code} · Technician: {panel.technician_name}</div>
          </div>

          <div className="qaqc-head-stats">
            {stats.map(item => (
              <div key={item.label} className="qaqc-head-stat">
                <div className="qaqc-head-stat-value" data-tone={item.tone}>{item.val}</div>
                <div className="qaqc-head-stat-label">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {isReInspect && (
          <div className="qaqc-reinspect-callout mt-3">
            <AlertTriangle size={14} className="inline mr-1" strokeWidth={1.5} /> Re-inspection - previous result: <strong>{detail.existing_inspection.overall_result}</strong>
          </div>
        )}
      </div>

      <div className="mb-6">
        <div className="qaqc-section-label">Visual Inspection Checks</div>
        <CheckRow label="Visual Check - Overall wiring quality and neatness" value={visual} onChange={setVisual} note={visualNote} onNoteChange={setVisualNote} />
        <CheckRow label="Labeling - Cable labels, ferrule markings, panel labels" value={labeling} onChange={setLabeling} note={labelingNote} onNoteChange={setLabelingNote} />
        <CheckRow label="Ferrule Check - Correct ferrule sizes, proper crimping" value={ferrule} onChange={setFerrule} note={ferruleNote} onNoteChange={setFerruleNote} />
        <CheckRow label="Compliance - Meets wiring standards and specifications" value={compliance} onChange={setCompliance} note={complianceNote} onNoteChange={setComplianceNote} />
      </div>

      <div className="mb-8">
        <div className="text-[14px] font-bold text-slate-800 uppercase tracking-wider mb-4">Red Markup / Corrections Required</div>
        <div className="bg-[var(--t-surface-white)] border border-[#E2E8F0] rounded-[12px] p-5 shadow-sm">
          <div className="flex flex-wrap gap-3 mb-4">
            {(['none', 'minor', 'major'] as MarkupVal[]).map(v => (
              <button
                key={v}
                onClick={() => setMarkup(v)}
                className={`flex items-center justify-center h-[44px] px-6 rounded-[10px] text-[13px] font-bold transition-colors border ${
                  markup === v
                    ? v === 'none' ? 'bg-green-600 border-green-600 text-white' : v === 'minor' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-red-600 border-red-600 text-white'
                    : 'bg-[var(--t-surface-white)] border-[#E2E8F0] text-slate-600 hover:bg-slate-50'
                }`}
                type="button"
              >
                {v === 'none' ? 'None' : v === 'minor' ? 'Minor Corrections' : 'Major Corrections'}
              </button>
            ))}
          </div>
          <input value={markupNote} onChange={e => setMarkupNote(e.target.value)} placeholder="Describe required corrections..." className="form-input" />
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[14px] font-bold text-slate-800 uppercase tracking-wider m-0">Issues Found ({issues.length})</div>
          <button onClick={() => setShowIssueForm(v => !v)} className="btn-sm" type="button">
            <Plus size={16} strokeWidth={2} />
            <span>Add Issue</span>
          </button>
        </div>

        {showIssueForm && (
          <div className="bg-[var(--t-surface-white)] border border-[#E2E8F0] rounded-[12px] p-5 shadow-sm mb-4">
            <div className="flex flex-wrap gap-3 mb-4">
              {(['critical', 'major', 'minor'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setIssueSev(s)}
                  className={`flex items-center justify-center h-[44px] px-6 rounded-[10px] text-[13px] font-bold transition-colors border ${
                    issueSev === s
                      ? s === 'critical' ? 'bg-red-600 border-red-600 text-white' : s === 'major' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-slate-600 border-slate-600 text-white'
                      : 'bg-[var(--t-surface-white)] border-[#E2E8F0] text-slate-600 hover:bg-slate-50'
                  }`}
                  type="button"
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <input value={issueDesc} onChange={e => setIssueDesc(e.target.value)} placeholder="Issue description *" className="form-input mb-3" />
            <input value={issueLoc} onChange={e => setIssueLoc(e.target.value)} placeholder="Location (e.g. Terminal X1, Cable F-003)" className="form-input mb-4" />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowIssueForm(false)} className="btn-secondary" type="button">Cancel</button>
              <button onClick={addIssue} disabled={!issueDesc.trim()} className="btn-primary" type="button">Add</button>
            </div>
          </div>
        )}

        {issues.length === 0 && !showIssueForm && <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-[12px] text-center text-slate-500 text-[14px] font-medium">No issues recorded</div>}

        <div className="flex flex-col gap-3">
          {issues.map(iss => (
            <div key={iss.id} className="flex items-start gap-4 p-4 bg-[var(--t-surface-white)] border border-[#E2E8F0] rounded-[10px] shadow-sm">
              <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-[6px] text-[11px] font-bold uppercase tracking-wider border shrink-0 ${
                iss.severity === 'critical' ? 'bg-red-50 text-red-600 border-red-200' :
                iss.severity === 'major' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                'bg-slate-50 text-slate-600 border-slate-200'
              }`}>{iss.severity.toUpperCase()}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-slate-800">{iss.description}</div>
                {iss.location && <div className="text-[13px] text-slate-500 mt-1">Location: {iss.location}</div>}
              </div>
              <button onClick={() => removeIssue(iss.id)} className="btn-icon hover:text-red-500 hover:bg-red-50" type="button" aria-label="Remove issue">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <div className="text-[14px] font-bold text-slate-800 uppercase tracking-wider mb-4">General Inspection Notes</div>
        <textarea
          value={inspNotes}
          onChange={e => setInspNotes(e.target.value)}
          rows={3}
          placeholder="Overall observations, recommendations, or additional comments..."
          className="w-full text-[14px] border border-[#E2E8F0] rounded-[12px] bg-slate-50 focus:bg-[var(--t-surface-white)] focus:border-[#2563EB] focus:ring-[3px] focus:ring-[#2563EB]/12 outline-none transition-all placeholder-slate-400 p-4"
        />
      </div>

      <div className="mb-8">
        <div className="text-[14px] font-bold text-slate-800 uppercase tracking-wider mb-4">Overall Inspection Result</div>
        <div className="grid grid-cols-1 tablet-port:grid-cols-2 tablet-land:grid-cols-3 gap-4">
          {resultOptions.map(r => (
            <button
              key={r.val}
              onClick={() => setResult(r.val)}
              className={`flex flex-col p-5 rounded-[12px] border-[2px] transition-all text-left ${
                result === r.val
                  ? r.tone === 'completed' ? 'bg-green-50 border-green-500 shadow-[0_4px_12px_rgba(34,197,94,0.15)]' :
                    r.tone === 'warning' ? 'bg-amber-50 border-amber-500 shadow-[0_4px_12px_rgba(245,158,11,0.15)]' :
                    'bg-red-50 border-red-500 shadow-[0_4px_12px_rgba(239,68,68,0.15)]'
                  : 'bg-[var(--t-surface-white)] border-[#E2E8F0] hover:border-slate-300'
              }`}
              type="button"
            >
              <div className={`text-[16px] font-bold mb-1 ${
                result === r.val
                  ? r.tone === 'completed' ? 'text-green-700' : r.tone === 'warning' ? 'text-amber-700' : 'text-red-700'
                  : 'text-slate-800'
              }`}>{r.label}</div>
              <div className="text-[13px] text-slate-500 font-medium">{r.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {suggested !== result && (
        <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-[12px] mb-8">
          <span className="text-[14px] text-blue-800 font-medium">Based on checks, suggested result: <strong>{suggested}</strong></span>
          <button onClick={() => setResult(suggested)} className="btn-sm text-blue-700 border-blue-200 hover:bg-blue-100" type="button">Apply</button>
        </div>
      )}

      {error && <div className="p-4 bg-red-50 text-red-600 text-[14px] font-medium rounded-[12px] border border-red-200 mb-8">{error}</div>}

      {saved && (
        <div className="flex items-center gap-2 p-4 bg-green-50 text-green-700 text-[14px] font-medium rounded-[12px] border border-green-200 mb-8">
          <Check size={18} strokeWidth={2} />
          <span>Inspection submitted successfully - result: <strong>{result}</strong></span>
        </div>
      )}

      <button onClick={handleSubmit} disabled={saving || saved} className={`btn w-full rounded-xl font-bold text-white shadow-sm ${
        saved ? 'bg-green-600 cursor-not-allowed opacity-100' :
        result === 'PASS' ? 'bg-green-600 hover:bg-green-700' :
        result === 'CONDITIONAL_PASS' ? 'bg-amber-500 hover:bg-amber-600' :
        'bg-red-600 hover:bg-red-700'
      } ${saving ? 'opacity-75 cursor-wait' : ''}`} type="button">
        {saved ? <Check size={20} strokeWidth={2} className="mr-2" /> : null}
        <span>{saving ? 'Submitting...' : saved ? 'Inspection Submitted' : `Submit Inspection - ${result}`}</span>
      </button>
    </div>
  );
}
