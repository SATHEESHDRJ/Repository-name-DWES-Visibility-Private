import { useEffect, useRef, useState } from 'react';
import { projectsApi } from '../../services/api';
import { X, RefreshCw, AlertTriangle, CheckCircle2, ShieldCheck, RotateCcw, FolderOpen, FileSpreadsheet, Info } from './icons';

const FIELD_LABELS: Record<string, string> = {
  ferrule: 'Ferrule', source: 'Source', destination: 'Destination',
  path: 'Path', source_device: 'Src Device', source_terminal: 'Src Terminal',
  dest_device: 'Dst Device', dest_terminal: 'Dst Terminal',
  color: 'Color', size: 'Size', length: 'Length', ref: 'Ref',
  remarks: 'Remarks', sign: 'Sign', sno: 'S.No', panel: 'Panel', rack: 'Rack',
};

const TABLE_COLS = ['ferrule', 'source', 'destination', 'color', 'size', 'length', 'ref'] as const;
type TableCol = typeof TABLE_COLS[number];

interface VerifyData {
  panel_name: string;
  original_filename: string;
  sheet_name: string;
  mapping: Record<string, string>;
  excel_headers: string[];
  cables: any[];
  validation: { total: number; ok_count: number; error_count: number; issues: Record<number, Record<string, string>> };
  compare_status: string;
  has_source_excel: boolean;
}

interface Props {
  projectCode: string;
  frameId: string;
  onClose: () => void;
  onVerified: () => void;
}

export default function VerificationModal({ projectCode, frameId, onClose, onVerified }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [meta, setMeta] = useState<Omit<VerifyData, 'cables' | 'validation'> | null>(null);
  const [cables, setCables] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<Record<number, Record<string, string>>>({});
  const [errorCount, setErrorCount] = useState(0);
  const [okCount, setOkCount] = useState(0);
  const [editCell, setEditCell] = useState<{ idx: number; field: TableCol } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [remapField, setRemapField] = useState<string | null>(null);
  const [remapping, setRemapping] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  // Source file comparison
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [comparing, setComparing] = useState(false);
  const [mismatches, setMismatches] = useState<Record<number, Record<string, string>>>({});
  const [mismatchCount, setMismatchCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  // Load cable data
  useEffect(() => {
    setLoading(true);
    setLoadError('');
    projectsApi.verifyData(projectCode, frameId)
      .then((d: VerifyData) => {
        const cableList = Array.isArray(d.cables) ? d.cables : [];
        setMeta({
          panel_name: d.panel_name,
          original_filename: d.original_filename,
          sheet_name: d.sheet_name,
          excel_headers: d.excel_headers || [],
          compare_status: d.compare_status,
          has_source_excel: d.has_source_excel,
          mapping: d.mapping || {},
        });
        setCables(cableList);
        setMapping(d.mapping || {});
        const v = d.validation || { issues: {}, error_count: 0, ok_count: cableList.length };
        setIssues(v.issues || {});
        setErrorCount(v.error_count || 0);
        setOkCount(v.ok_count ?? cableList.length);
        setLoading(false);
      })
      .catch((e: any) => {
        setLoadError(e?.response?.data?.message || e?.message || 'Failed to load cable data. Check backend is running.');
        setLoading(false);
      });
  }, [projectCode, frameId]);

  useEffect(() => {
    if (editCell && editRef.current) editRef.current.focus();
  }, [editCell]);

  // Click-away to close remap dropdown
  useEffect(() => {
    if (!remapField) return;
    const close = () => setRemapField(null);
    const t = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', close); };
  }, [remapField]);

  const applyValidation = (v: VerifyData['validation']) => {
    setIssues(v?.issues || {});
    setErrorCount(v?.error_count || 0);
    setOkCount(v?.ok_count ?? 0);
  };

  const startEdit = (idx: number, field: TableCol) => {
    setEditCell({ idx, field });
    setEditValue(String(cables[idx]?.[field] ?? ''));
  };

  const saveEdit = async () => {
    if (!editCell) return;
    const { idx, field } = editCell;
    const prev = String(cables[idx]?.[field] ?? '');
    setEditCell(null);
    if (prev === editValue) return;
    const val = editValue;
    setCables(cs => { const n = [...cs]; n[idx] = { ...n[idx], [field]: val }; return n; });
    try {
      const r = await projectsApi.patchCable(projectCode, frameId, idx, field, val);
      setCables(cs => { const n = [...cs]; n[idx] = r.cable; return n; });
      applyValidation(r.validation);
    } catch {
      setCables(cs => { const n = [...cs]; n[idx] = { ...n[idx], [field]: prev }; return n; });
    }
  };

  const handleRemap = async (field: string, header: string) => {
    setRemapField(null);
    setRemapping(true);
    try {
      const r = await projectsApi.remapColumn(projectCode, frameId, field, header);
      setCables(r.cables);
      setMapping(r.mapping);
      applyValidation(r.validation);
    } catch { /* ignore */ }
    finally { setRemapping(false); }
  };

  // Handle source file selection → send to backend for comparison
  const handleSourceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceFile(file);
    setComparing(true);
    setMismatches({});
    setMismatchCount(0);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await projectsApi.compareSourceFile(projectCode, frameId, fd);
      setMismatches(r.mismatches || {});
      setMismatchCount(r.mismatch_count || 0);
    } catch { /* comparison failure is non-fatal */ }
    finally {
      setComparing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setConfirmError('');
    try {
      await projectsApi.verifyConfirm(projectCode, frameId);
      onVerified();
    } catch (e: any) {
      setConfirmError(e?.response?.data?.message || 'Verification failed — try again.');
    } finally {
      setConfirming(false);
    }
  };

  const isVerified = meta?.compare_status === 'validated' || meta?.compare_status === 'verified';
  const mappedEntries = Object.entries(mapping).filter(([, v]) => v);
  const totalIssues = errorCount + mismatchCount;

  return (
    <div
      className="modal-overlay z-[210]"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-box-full relative">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close"
              className="w-10 h-10 min-w-10 min-h-10 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            >
              <X size={18} />
            </button>
            <div className="flex-1 min-w-0">
              <div
                className="text-[15px] font-bold text-slate-900 break-words"
                title={`Verify: ${meta?.panel_name || 'Frame'}`}
              >
                Verify: {meta?.panel_name || (loading ? '…' : 'Frame')}
              </div>
              <div
                className="text-[11px] font-mono text-slate-500 break-words mt-0.5"
                title={[meta?.original_filename, meta?.sheet_name && `Sheet: ${meta.sheet_name}`].filter(Boolean).join(' · ')}
              >
                {meta?.original_filename}
                {meta?.sheet_name && ` · Sheet: ${meta.sheet_name}`}
                {!loading && cables.length > 0 && ` · ${cables.length} cables`}
              </div>
            </div>
            {/* Status badge */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold select-none shrink-0 border ${
              loading ? 'bg-slate-50 text-slate-500 border-slate-200' :
              isVerified ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              'bg-slate-50 text-slate-600 border-slate-200'
            }`}>
              {isVerified ? <CheckCircle2 size={14} /> : <Info size={14} />}
              {loading ? 'Loading…' : isVerified ? 'Verified' : `Draft`}
            </div>
          </div>

          {/* Toolbar: source file button + mapping chips */}
          {!loading && !loadError && (
            <div className="flex flex-wrap gap-2 items-center min-h-[28px]">
              {/* ── Select Source File (optional) ── */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                title="Select original Excel file for comparison"
                className="hidden"
                onChange={handleSourceFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={comparing}
                title="Optionally select the original Excel to compare against parsed data"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors select-none
                  border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 disabled:opacity-50"
              >
                <FolderOpen size={12} />
                {comparing ? 'Comparing…' : 'Select Source File'}
              </button>

              {/* Comparison result chip */}
              {sourceFile && !comparing && (
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold border select-none ${
                  mismatchCount === 0
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <FileSpreadsheet size={10} />
                  <span className="modal-long-text max-w-[min(100%,280px)]" title={sourceFile.name}>{sourceFile.name}</span>
                  <span>—</span>
                  <span>{mismatchCount === 0 ? 'No mismatches' : `${mismatchCount} mismatch${mismatchCount !== 1 ? 'es' : ''}`}</span>
                </div>
              )}

              {/* Divider */}
              {mappedEntries.length > 0 && (
                <span className="text-slate-200 select-none text-[14px]">|</span>
              )}

              {/* Mapping chips */}
              {mappedEntries.map(([field, excelCol]) => (
                <div key={field} className="relative" onClick={e => e.stopPropagation()}>
                  <div className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 border text-[10px] font-semibold cursor-default select-none ${
                    remapField === field ? 'bg-blue-100 border-blue-300' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <span className="text-slate-500">{FIELD_LABELS[field] || field}</span>
                    <span className="text-slate-500">←</span>
                    <span className="font-mono text-blue-700">{excelCol}</span>
                    {meta?.has_source_excel && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setRemapField(remapField === field ? null : field); }}
                        className="text-slate-500 hover:text-blue-600 transition-colors ml-0.5 cursor-pointer"
                        title="Remap this column"
                        disabled={remapping}
                      >
                        <RefreshCw size={10} className={remapping ? 'animate-spin' : ''} />
                      </button>
                    )}
                  </div>

                  {remapField === field && (
                    <div
                      className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden min-w-[200px]"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500 select-none">
                        Remap "{FIELD_LABELS[field] || field}" to:
                      </div>
                      <div className="overflow-y-auto max-h-[240px] p-1">
                        {(meta?.excel_headers || []).map(h => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => handleRemap(field, h)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-colors ${
                              mapping[field] === h
                                ? 'bg-blue-50 text-blue-700 font-semibold'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-slate-100 p-1">
                        <button
                          type="button"
                          onClick={() => handleRemap(field, '')}
                          className="w-full flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <RotateCcw size={10} /> Remove mapping
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {!meta?.has_source_excel && mappedEntries.length === 0 && (
                <span className="text-[11px] text-slate-500 italic select-none">
                  No source Excel stored — use "Select Source File" to compare, or edit cells directly.
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Cable Table ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-500 text-[13px]">
              Loading cable data…
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <AlertTriangle size={32} className="text-red-400" />
              <div className="text-[13px] font-semibold text-red-600 text-center max-w-md">{loadError}</div>
              <div className="text-[11px] text-slate-500 text-center">
                Ensure the backend server is running, then close and re-open the verification modal.
              </div>
            </div>
          ) : cables.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-500">
              <Info size={32} />
              <div className="text-[13px]">No cable data found for this frame.</div>
            </div>
          ) : (
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 z-10 shadow-[0_1px_0_#E2E8F0]">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[44px] select-none border-r border-slate-100 bg-slate-50">
                    #
                  </th>
                  {TABLE_COLS.map(col => {
                    const hasIssue = Object.values(issues).some(ci => col in ci);
                    const hasMismatch = !hasIssue && Object.values(mismatches).some(cm => col in cm);
                    return (
                      <th
                        key={col}
                        className={`px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider select-none ${
                          hasIssue ? 'text-red-500 bg-red-50' :
                          hasMismatch ? 'text-amber-600 bg-amber-50' :
                          'text-slate-500 bg-slate-50'
                        }`}
                      >
                        {FIELD_LABELS[col]}
                        {hasIssue && <span className="ml-1 opacity-60">⚠</span>}
                        {hasMismatch && <span className="ml-1 opacity-60">≠</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cables.map((cable, idx) => {
                  const rowIssues = issues[idx] || {};
                  const rowMismatches = mismatches[idx] || {};
                  const hasRowError = Object.keys(rowIssues).length > 0;
                  const hasRowMismatch = !hasRowError && Object.keys(rowMismatches).length > 0;
                  return (
                    <tr
                      key={idx}
                      className={`transition-colors hover:bg-blue-50/20 ${
                        hasRowError ? 'bg-red-50/30' :
                        hasRowMismatch ? 'bg-amber-50/30' :
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      <td className="px-3 py-1.5 text-[11px] tabular-nums text-slate-500 border-r border-slate-100 select-none bg-slate-50/50">
                        {cable.sno ?? idx + 1}
                      </td>
                      {TABLE_COLS.map(col => {
                        const issue = rowIssues[col];
                        const mismatch = !issue ? rowMismatches[col] : undefined;
                        const isEditing = editCell?.idx === idx && editCell?.field === col;
                        const val = String(cable[col] ?? '');

                        return (
                          <td
                            key={col}
                            className={`px-2 py-1 ${isEditing ? '' : 'cursor-pointer'} ${
                              issue ? 'bg-red-50 border-l-2 border-red-300' :
                              mismatch ? 'bg-amber-50 border-l-2 border-amber-300' : ''
                            }`}
                            title={issue || mismatch || undefined}
                            onClick={() => { if (!isEditing) startEdit(idx, col); }}
                          >
                            {isEditing ? (
                              <input
                                ref={editRef}
                                type="text"
                                value={editValue}
                                title={`Edit ${FIELD_LABELS[col] || col}`}
                                placeholder={`Enter ${FIELD_LABELS[col] || col}`}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={saveEdit}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveEdit();
                                  if (e.key === 'Escape') setEditCell(null);
                                }}
                                className="w-full bg-blue-50 border border-blue-400 rounded px-1.5 py-0.5 text-[12px] outline-none focus:ring-2 focus:ring-blue-300 min-w-[100px]"
                              />
                            ) : (
                              <span
                                className={`block truncate ${
                                issue ? 'text-red-600 font-medium' :
                                mismatch ? 'text-amber-700 font-medium' :
                                val ? 'text-slate-700' : 'text-slate-500 italic'
                              } ${col === 'ferrule' ? 'font-mono text-[11px]' : ''}`}
                                title={val || issue || mismatch || undefined}
                              >
                                {val || (issue ? `⚠ ${issue}` : '—')}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white shrink-0 rounded-b-2xl">
          <div className="flex items-center gap-4">

            {/* Left: status summary + progress */}
            <div className="flex-1 min-w-0">
              {!loadError && cables.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 select-none">
                      {cables.length} cables
                      {totalIssues > 0
                        ? ` · ${errorCount > 0 ? `${errorCount} validation issue${errorCount !== 1 ? 's' : ''}` : ''}${errorCount > 0 && mismatchCount > 0 ? ', ' : ''}${mismatchCount > 0 ? `${mismatchCount} source mismatch${mismatchCount !== 1 ? 'es' : ''}` : ''}`
                        : ' · Ready to verify'}
                    </span>
                    <span className={`text-[11px] font-bold tabular-nums select-none ${
                      totalIssues === 0 ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      {okCount}/{cables.length}
                    </span>
                  </div>
                  <progress
                    className="cr-progress w-full"
                    data-tone={totalIssues === 0 ? 'rollup' : 'destination'}
                    data-h="8"
                    value={okCount}
                    max={Math.max(cables.length, 1)}
                  />
                  {totalIssues > 0 && (
                    <div className="text-[11px] text-slate-500 mt-1 select-none">
                      Issues are for review only — you can still confirm and mark as verified.
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[12px] text-slate-500 select-none">
                  {loadError
                    ? 'Could not load cables — confirm is unavailable.'
                    : cables.length === 0 && !loading
                      ? 'No cables found. You can still confirm.'
                      : ''}
                </div>
              )}
            </div>

            {/* Right: buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming || !!loadError}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ShieldCheck size={16} />
                <span>
                  {confirming ? 'Confirming…' : isVerified ? 'Re-confirm' : 'Confirm & Verify'}
                </span>
              </button>
            </div>
          </div>

          {confirmError && <div className="form-error mt-2">{confirmError}</div>}
        </div>

      </div>
    </div>
  );
}
