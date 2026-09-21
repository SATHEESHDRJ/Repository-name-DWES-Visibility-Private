import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { techApi } from '../../../services/api';
import Modal from '../../../components/Modal';
import SvgFrameViewer from '../../../components/SvgFrameViewer';

interface WiringTabProps {
  panel: any | null;
  onPanelUpdate: () => void;
}

interface CableRow {
  sno: string | number;
  ferrule: string;
  source: string;
  destination: string;
  color?: string;
  size?: string;
  length?: string;
  sign?: string;
  ref?: string;
  remarks?: string;
}

interface CableStatus {
  src: boolean;
  dst: boolean;
  note: string;
}

function getCableTone(st: CableStatus): 'completed' | 'warning' | 'progress' | 'pending' {
  if (st.src && st.dst) return 'completed';
  if (st.src || st.dst) return 'warning';
  return 'pending';
}

function getCableLabel(st: CableStatus) {
  if (st.src && st.dst) return 'Completed';
  if (st.src && !st.dst) return 'Src Only';
  if (!st.src && st.dst) return 'Dst Only';
  return 'Pending';
}

export default function WiringTab({ panel, onPanelUpdate }: WiringTabProps) {
  const [detail, setDetail] = useState<any>(null);
  const [status, setStatus] = useState<Record<string, CableStatus>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'pending' | 'one_end' | 'done' | 'all'>('pending');
  const [saving, setSaving] = useState(false);
  const [oneEndOpen, setOneEndOpen] = useState(false);
  const [showSvgViewer, setShowSvgViewer] = useState(false);
  const [noteText, setNoteText] = useState('');
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const getStatus = useCallback((index: number, st: Record<string, CableStatus>): CableStatus =>
    st[String(index)] || { src: false, dst: false, note: '' }, []);

  const load = useCallback(() => {
    if (!panel) return;
    techApi.myAssignmentDetail(panel.id).then(data => {
      setDetail(data);
      const nextStatus: Record<string, CableStatus> = {};
      Object.entries(data.assignment.cable_status || {}).forEach(([key, value]: [string, any]) => {
        nextStatus[key] = { src: !!value.src, dst: !!value.dst, note: value.note || '' };
      });
      setStatus(nextStatus);
      const cables: CableRow[] = data.frame?.cables || [];
      const firstPending = cables.findIndex((_, i) => {
        const st = nextStatus[String(i)];
        return !st || !st.src || !st.dst;
      });
      const startIdx = firstPending >= 0 ? firstPending : 0;
      setCurrentIdx(startIdx);
      setNoteText(nextStatus[String(startIdx)]?.note || '');
    });
  }, [panel]);

  useEffect(() => { load(); }, [load]);

  const cables: CableRow[] = detail?.frame?.cables || [];
  const total = cables.length;
  const srcDone = Object.values(status).filter(item => item.src).length;
  const dstDone = Object.values(status).filter(item => item.dst).length;
  const srcPct = total > 0 ? Math.round((srcDone / total) * 100) : 0;
  const dstPct = total > 0 ? Math.round((dstDone / total) * 100) : 0;

  const isActive = panel?.status === 'in_progress';

  const scrollToRow = (idx: number) => {
    setTimeout(() => {
      const row = listRef.current?.querySelector(`[data-cable-idx="${idx}"]`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  };

  const goNext = useCallback((fromIdx: number, currentStatus: Record<string, CableStatus>) => {
    const len = cables.length;
    if (len === 0) return;
    for (let i = fromIdx + 1; i < len; i++) {
      const st = getStatus(i, currentStatus);
      if (!st.src || !st.dst) { setCurrentIdx(i); setNoteText(st.note || ''); scrollToRow(i); return; }
    }
    for (let i = 0; i < fromIdx; i++) {
      const st = getStatus(i, currentStatus);
      if (!st.src || !st.dst) { setCurrentIdx(i); setNoteText(st.note || ''); scrollToRow(i); return; }
    }
  }, [cables, getStatus]);

  const doAction = async (action: 'complete' | 'src_only' | 'dst_only') => {
    if (!isActive || saving) return;
    setSaving(true);
    const prevStatus = { ...status };
    const key = String(currentIdx);
    const prev = getStatus(currentIdx, status);
    const next = { ...prev };
    if (action === 'complete') { next.src = true; next.dst = true; }
    else if (action === 'src_only') next.src = true;
    else next.dst = true;
    const updated = { ...status, [key]: next };
    setStatus(updated);
    try {
      await techApi.cableAction(panel.id, currentIdx, action);
      onPanelUpdate();
      goNext(currentIdx, updated);
    } catch {
      setStatus(prevStatus);
    } finally {
      setSaving(false);
    }
  };

  const doSkip = () => {
    goNext(currentIdx, status);
  };

  const doNoteChange = (value: string) => {
    setNoteText(value);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(async () => {
      try { await techApi.cableStatus(panel.id, currentIdx, 'note', value); } catch { /* non-critical */ }
    }, 800);
  };

  const currentCable = cables[currentIdx] || null;
  const currentStatus = getStatus(currentIdx, status);

  const filteredCables = cables.map((c, i) => ({ cable: c, index: i, st: getStatus(i, status) })).filter(({ cable, st }) => {
    const matchFilter = filter === 'all' ? true
      : filter === 'done' ? st.src && st.dst
      : filter === 'one_end' ? (st.src || st.dst) && !(st.src && st.dst)
      : !st.src && !st.dst;
    const matchSearch = !search || [cable.ferrule, cable.source, cable.destination].some(v =>
      (v || '').toLowerCase().includes(search.toLowerCase()));
    return matchFilter && matchSearch;
  });

  const filterCount = (f: typeof filter) => cables.filter((_, i) => {
    const s = getStatus(i, status);
    if (f === 'done') return s.src && s.dst;
    if (f === 'one_end') return (s.src || s.dst) && !(s.src && s.dst);
    if (f === 'pending') return !s.src && !s.dst;
    return true;
  }).length;

  if (!panel) {
    return (
      <div className="dwes-empty-state">
        <div className="dwes-empty-title">Select a panel to begin wiring</div>
        <div className="dwes-empty-copy">Open a panel from Assigned Projects and start an assignment.</div>
      </div>
    );
  }
  if (!detail) {
    return <div className="dwes-empty-state"><div className="dwes-empty-copy">Loading cables...</div></div>;
  }

  return (
    <div>
      {/* Progress bars */}
      <section className="progress-card">
        <div className="progress-card-header">
          <div>
            <div className="progress-card-title">{panel.panel_name}</div>
            <div className="progress-meta">{total} cables · {panel.project_code}</div>
          </div>
          <span className="status-chip" data-tone={isActive ? 'progress' : 'warning'}>
            {isActive ? 'Live panel execution' : panel.status}
          </span>
        </div>
        <div className="progress-stack">
          <div className="progress-row">
            <div className="progress-label" data-tone="source">
              <span>Source terminal</span><span>{srcDone}/{total} ({srcPct}%)</span>
            </div>
            <div className="progress-track">
              <progress className="progress-fill progress-fill-bar" data-tone="source" value={srcPct} max={100} />
            </div>
          </div>
          <div className="progress-row">
            <div className="progress-label" data-tone="destination">
              <span>Destination terminal</span><span>{dstDone}/{total} ({dstPct}%)</span>
            </div>
            <div className="progress-track">
              <progress className="progress-fill progress-fill-bar" data-tone="destination" value={dstPct} max={100} />
            </div>
          </div>
        </div>
      </section>

      {/* Current cable focused card */}
      {currentCable && (
        <section className="wf-current-card" data-tone={getCableTone(currentStatus)}>
          <div className="wf-current-header">
            <div className="wf-cable-number">
              <span className="wf-cable-idx">#{currentIdx + 1} / {total}</span>
              <span className="wf-cable-sno">Wire {currentCable.sno}</span>
            </div>
            <span className="status-chip" data-tone={getCableTone(currentStatus)}>
              {getCableLabel(currentStatus)}
            </span>
          </div>

          {currentCable.ferrule && (
            <div className="wf-ferrule-row">
              <span className="wf-attr-label">Ferrule</span>
              <span className="wf-ferrule-value">{currentCable.ferrule}</span>
            </div>
          )}

          <div className="wf-path-grid">
            <div className="wf-path-card" data-tone="source">
              <div className="wf-path-chip" data-tone="source">
                SOURCE {currentStatus.src ? '✓' : ''}
              </div>
              <div className="wf-path-value">{currentCable.source || '—'}</div>
            </div>
            <div className="wf-path-divider">→</div>
            <div className="wf-path-card" data-tone="destination">
              <div className="wf-path-chip" data-tone="destination">
                DESTINATION {currentStatus.dst ? '✓' : ''}
              </div>
              <div className="wf-path-value">{currentCable.destination || '—'}</div>
            </div>
          </div>

          <div className="wf-attrs-row">
            {currentCable.color && (
              <span className="wf-attr"><span className="wf-attr-label">Color</span>{currentCable.color}</span>
            )}
            {currentCable.size && (
              <span className="wf-attr"><span className="wf-attr-label">Size</span>{currentCable.size}</span>
            )}
            {currentCable.length && (
              <span className="wf-attr"><span className="wf-attr-label">Length</span>{currentCable.length}</span>
            )}
            {currentCable.sign && (
              <span className="wf-attr"><span className="wf-attr-label">Sign</span>{currentCable.sign}</span>
            )}
          </div>

          {currentCable.remarks && (
            <div className="wf-remarks">
              <span className="wf-attr-label">Remarks: </span>{currentCable.remarks}
            </div>
          )}

          <div className="wf-note-row">
            <textarea
              value={noteText}
              onChange={e => doNoteChange(e.target.value)}
              disabled={!isActive}
              placeholder={isActive ? 'Add a note for this cable (optional)' : ''}
              rows={2}
              className="dwes-textarea wf-note-area"
            />
          </div>

          {/* 4 action buttons */}
          <div className="wf-action-grid">
            <button
              className="wf-action-btn wf-complete"
              onClick={() => doAction('complete')}
              disabled={!isActive || saving || (currentStatus.src && currentStatus.dst)}
              type="button"
            >
              <span className="wf-btn-icon">✓</span>
              <span className="wf-btn-label">Complete</span>
              <span className="wf-btn-sub">Both ends done</span>
            </button>

            <button
              className="wf-action-btn wf-one-end"
              onClick={() => setOneEndOpen(true)}
              disabled={!isActive || saving}
              type="button"
            >
              <span className="wf-btn-icon">⚡</span>
              <span className="wf-btn-label">One End Open</span>
              <span className="wf-btn-sub">Mark one terminal</span>
            </button>

            <button
              className="wf-action-btn wf-skip"
              onClick={doSkip}
              disabled={!isActive || saving}
              type="button"
            >
              <span className="wf-btn-icon">→</span>
              <span className="wf-btn-label">Skip</span>
              <span className="wf-btn-sub">Come back later</span>
            </button>

            <button
              className="wf-action-btn wf-prev"
              onClick={() => {
                const prev = currentIdx > 0 ? currentIdx - 1 : total - 1;
                setCurrentIdx(prev);
                setNoteText(getStatus(prev, status).note || '');
                scrollToRow(prev);
              }}
              disabled={total <= 1}
              type="button"
            >
              <span className="wf-btn-icon">←</span>
              <span className="wf-btn-label">Previous</span>
              <span className="wf-btn-sub">Go back one cable</span>
            </button>

            <button
              className="wf-action-btn wf-view-frame"
              onClick={() => setShowSvgViewer(true)}
              disabled={!isActive}
              style={{ backgroundColor: 'var(--status-progress)', color: '#fff' }}
              type="button"
            >
              <span className="wf-btn-icon">👁</span>
              <span className="wf-btn-label">View Frame</span>
              <span className="wf-btn-sub">Open SVG schematic</span>
            </button>
          </div>

          {!isActive && (
            <div className="wf-inactive-notice">
              Start the wiring session from the Panels tab to enable actions.
            </div>
          )}
        </section>
      )}

      {/* Wire list table */}
      <section className="wf-list-section">
        <div className="wf-list-toolbar">
          <div className="filter-chips">
            {(['pending', 'one_end', 'done', 'all'] as const).map(f => (
              <button
                key={f}
                className={`filter-chip ${filter === f ? 'is-active' : ''}`}
                onClick={() => setFilter(f)}
                type="button"
              >
                {f === 'one_end' ? 'One End' : f === 'done' ? 'Done' : f.charAt(0).toUpperCase() + f.slice(1)}
                <span className="wf-count-badge">{filterCount(f)}</span>
              </button>
            ))}
          </div>

          <div className="dwes-input-wrap">
            <Search className="dwes-input-icon" size={16} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ferrule, source, destination…"
              className="dwes-input has-leading-icon wf-search"
            />
          </div>
        </div>

        <div className="wf-table-wrap" ref={listRef}>
          <table className="dwes-table wf-wire-table">
            <thead>
              <tr>
                <th className="wf-col-num">#</th>
                <th>Wire No</th>
                <th>Ferrule</th>
                <th>Source</th>
                <th>Destination</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredCables.map(({ cable, index, st }) => (
                <tr
                  key={index}
                  data-cable-idx={index}
                  className={`wf-wire-row ${index === currentIdx ? 'wf-row-active' : ''}`}
                  onClick={() => {
                    setCurrentIdx(index);
                    setNoteText(getStatus(index, status).note || '');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <td className="wf-col-num">{index + 1}</td>
                  <td className="table-cell-mono">{cable.sno}</td>
                  <td className="table-cell-mono">{cable.ferrule || '—'}</td>
                  <td className="wf-path-cell">{cable.source || '—'}</td>
                  <td className="wf-path-cell">{cable.destination || '—'}</td>
                  <td>
                    <span className="status-chip status-chip-sm" data-tone={getCableTone(st)}>
                      {getCableLabel(st)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredCables.length === 0 && (
            <div className="dwes-empty-state">
              <div className="dwes-empty-copy">No cables match this filter.</div>
            </div>
          )}
        </div>
      </section>

      {/* One End Open modal */}
      {oneEndOpen && (
        <Modal
          title="Which end is open?"
          onClose={() => setOneEndOpen(false)}
          width={380}
          footer={null}
        >
          <div className="wf-one-end-body">
            <div className="wf-one-end-cable">
              <span className="wf-attr-label">Cable</span>
              {currentCable?.source} → {currentCable?.destination}
            </div>
            <div className="wf-one-end-btns">
              <button
                className="wf-end-btn wf-end-source"
                onClick={async () => { setOneEndOpen(false); await doAction('src_only'); }}
                type="button"
              >
                <span className="wf-end-icon">⚙</span>
                <span className="wf-end-label">Source</span>
                <span className="wf-end-sub">Source terminal wired</span>
              </button>
              <button
                className="wf-end-btn wf-end-destination"
                onClick={async () => { setOneEndOpen(false); await doAction('dst_only'); }}
                type="button"
              >
                <span className="wf-end-icon">⚙</span>
                <span className="wf-end-label">Destination</span>
                <span className="wf-end-sub">Destination terminal wired</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* SVG Frame Viewer Modal */}
      {showSvgViewer && panel && detail && (
        <SvgFrameViewer
          cables={cables}
          cableStatus={status}
          currentIdx={currentIdx}
          panelName={panel.panel_name}
          onClose={() => setShowSvgViewer(false)}
        />
      )}
    </div>
  );
}
