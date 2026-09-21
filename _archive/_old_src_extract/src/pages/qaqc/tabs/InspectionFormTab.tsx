import { useState, useEffect } from 'react';
import { qaqcApi } from '../../../services/api';

interface InspectionFormTabProps {
  panel: any | null;
  onInspectionDone: () => void;
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

const CHECK_LABEL: Record<CheckVal, string> = { pass: 'PASS ✓', fail: 'FAIL ✗' };

function CheckRow({ label, value, onChange, note, onNoteChange, disabled }: {
  label: string;
  value: CheckVal;
  onChange: (v: CheckVal) => void;
  note: string;
  onNoteChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="qaqc-check-row">
      <div className="qaqc-check-row-head">
        <div className="qaqc-check-label">{label}</div>
        <div className="qaqc-check-actions">
          {(['pass', 'fail'] as CheckVal[]).map(v => (
            <button
              key={v}
              disabled={disabled}
              onClick={() => !disabled && onChange(v)}
              className={`qaqc-toggle-btn ${value === v ? 'is-active' : ''}`}
              data-tone={v}
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
        className="qaqc-note-input"
      />
    </div>
  );
}

export default function InspectionFormTab({ panel, onInspectionDone }: InspectionFormTabProps) {
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

  useEffect(() => {
    if (!panel) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setSaved(false);
    setError('');
    qaqcApi.panelDetail(panel.id).then(d => {
      setDetail(d);
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
        setIssues([]);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [panel, panel?.id]);

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
        <div className="qaqc-empty-icon">🔍</div>
        <div className="qaqc-empty-title">No panel selected</div>
        <div className="qaqc-empty-copy">Click "Inspect Panel" from the Panels tab to start an inspection.</div>
      </div>
    );
  }

  if (loading) return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading panel details...</div></div>;

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
      <div className="qaqc-head-card mb-lg">
        <div className="qaqc-head-row">
          <div>
            <div className="qaqc-head-title">{panel.panel_display_name || panel.panel_name}</div>
            <div className="qaqc-head-sub mt-xxs">{panel.project_code} · Technician: {panel.technician_name}</div>
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
          <div className="qaqc-reinspect-callout mt-sm">
            ⚠ Re-inspection - previous result: <strong>{detail.existing_inspection.overall_result}</strong>
          </div>
        )}
      </div>

      <div className="mb-lg">
        <div className="qaqc-section-label">Visual Inspection Checks</div>
        <CheckRow label="Visual Check - Overall wiring quality and neatness" value={visual} onChange={setVisual} note={visualNote} onNoteChange={setVisualNote} />
        <CheckRow label="Labeling - Cable labels, ferrule markings, panel labels" value={labeling} onChange={setLabeling} note={labelingNote} onNoteChange={setLabelingNote} />
        <CheckRow label="Ferrule Check - Correct ferrule sizes, proper crimping" value={ferrule} onChange={setFerrule} note={ferruleNote} onNoteChange={setFerruleNote} />
        <CheckRow label="Compliance - Meets wiring standards and specifications" value={compliance} onChange={setCompliance} note={complianceNote} onNoteChange={setComplianceNote} />
      </div>

      <div className="mb-lg">
        <div className="qaqc-section-label">Red Markup / Corrections Required</div>
        <div className="qaqc-card">
          <div className="qaqc-toggle-row mb-sm">
            {(['none', 'minor', 'major'] as MarkupVal[]).map(v => (
              <button
                key={v}
                onClick={() => setMarkup(v)}
                className={`qaqc-toggle-btn ${markup === v ? 'is-active' : ''}`}
                data-tone={v === 'none' ? 'pass' : v === 'minor' ? 'warning' : 'fail'}
                type="button"
              >
                {v === 'none' ? 'None' : v === 'minor' ? 'Minor Corrections' : 'Major Corrections'}
              </button>
            ))}
          </div>
          <input value={markupNote} onChange={e => setMarkupNote(e.target.value)} placeholder="Describe required corrections..." className="qaqc-note-input" />
        </div>
      </div>

      <div className="mb-lg">
        <div className="qaqc-issues-head">
          <div className="qaqc-section-label m-0">Issues Found ({issues.length})</div>
          <button onClick={() => setShowIssueForm(v => !v)} className="button-compact sessions-clear-btn" type="button">+ Add Issue</button>
        </div>

        {showIssueForm && (
          <div className="qaqc-card mb-sm">
            <div className="qaqc-toggle-row mb-sm">
              {(['critical', 'major', 'minor'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setIssueSev(s)}
                  className={`qaqc-toggle-btn ${issueSev === s ? 'is-active' : ''}`}
                  data-tone={s === 'critical' ? 'fail' : s === 'major' ? 'warning' : 'muted'}
                  type="button"
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <input value={issueDesc} onChange={e => setIssueDesc(e.target.value)} placeholder="Issue description *" className="dwes-input mb-sm" />
            <input value={issueLoc} onChange={e => setIssueLoc(e.target.value)} placeholder="Location (e.g. Terminal X1, Cable F-003)" className="dwes-input mb-sm" />
            <div className="qaqc-issue-actions">
              <button onClick={() => setShowIssueForm(false)} className="dwes-button dwes-button-neutral" type="button">Cancel</button>
              <button onClick={addIssue} disabled={!issueDesc.trim()} className="dwes-button dwes-button-primary" type="button">Add</button>
            </div>
          </div>
        )}

        {issues.length === 0 && !showIssueForm && <div className="qaqc-no-issues">No issues recorded</div>}

        <div className="stack-grid-sm">
          {issues.map(iss => (
            <div key={iss.id} className="history-issue-row" data-severity={iss.severity}>
              <span className="history-issue-severity" data-severity={iss.severity}>{iss.severity.toUpperCase()}</span>
              <div className="history-item-main">
                <div className="history-issue-desc">{iss.description}</div>
                {iss.location && <div className="history-issue-location mt-xxs">Location: {iss.location}</div>}
              </div>
              <button onClick={() => removeIssue(iss.id)} className="qaqc-remove-issue" type="button">×</button>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-lg">
        <div className="qaqc-section-label">General Inspection Notes</div>
        <textarea
          value={inspNotes}
          onChange={e => setInspNotes(e.target.value)}
          rows={3}
          placeholder="Overall observations, recommendations, or additional comments..."
          className="dwes-textarea"
        />
      </div>

      <div className="mb-lg">
        <div className="qaqc-section-label">Overall Inspection Result</div>
        <div className="qaqc-result-grid">
          {resultOptions.map(r => (
            <button
              key={r.val}
              onClick={() => setResult(r.val)}
              className={`qaqc-result-card ${result === r.val ? 'is-active' : ''}`}
              data-tone={r.tone}
              type="button"
            >
              <div className="qaqc-result-title" data-tone={r.tone}>{r.label}</div>
              <div className="qaqc-result-copy">{r.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {suggested !== result && (
        <div className="qaqc-suggested mb-md">
          <span className="qaqc-suggested-copy">Based on checks, suggested result: <strong>{suggested}</strong></span>
          <button onClick={() => setResult(suggested)} className="button-compact" type="button">Apply</button>
        </div>
      )}

      {error && <div className="dwes-error mb-md">{error}</div>}

      {saved && (
        <div className="dwes-message-success mb-md">
          ✓ Inspection submitted successfully - result: <strong>{result}</strong>
        </div>
      )}

      <button onClick={handleSubmit} disabled={saving || saved} className="dwes-button dwes-button-primary qaqc-submit-btn" data-result={result} type="button">
        {saving ? 'Submitting...' : saved ? '✓ Inspection Submitted' : `Submit Inspection - ${result}`}
      </button>
    </div>
  );
}
