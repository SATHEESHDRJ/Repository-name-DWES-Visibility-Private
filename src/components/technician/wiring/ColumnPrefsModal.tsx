import { useMemo, useState } from 'react';
import { Eye, EyeOff, Pin, Search } from '../../ui/icons';
import Modal from '../../Modal';
import type { ColumnPrefs } from './column-prefs';

interface Props {
  excelHeaders: string[];
  prefs: ColumnPrefs;
  onSave: (prefs: ColumnPrefs) => void;
  onClose: () => void;
}

export default function ColumnPrefsModal({ excelHeaders, prefs, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<ColumnPrefs>(() => ({
    pinned: [...prefs.pinned],
    hidden: [...prefs.hidden],
  }));
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return excelHeaders;
    return excelHeaders.filter(h => h.toLowerCase().includes(q));
  }, [excelHeaders, search]);

  const togglePin = (header: string) => {
    setDraft(prev => ({
      ...prev,
      pinned: prev.pinned.includes(header)
        ? prev.pinned.filter(h => h !== header)
        : [...prev.pinned, header],
    }));
  };

  const toggleHidden = (header: string) => {
    setDraft(prev => ({
      ...prev,
      hidden: prev.hidden.includes(header)
        ? prev.hidden.filter(h => h !== header)
        : [...prev.hidden, header],
    }));
  };

  return (
    <Modal title="Schedule columns" onClose={onClose}>
      <p className="text-[13px] text-slate-500 mb-3">
        Pin fields on the cable card, or hide columns from the main grid — all Excel data stays available in the details drawer.
      </p>
      <div className="ws-col-search-wrap mb-3">
        <Search size={14} className="text-slate-400 shrink-0" />
        <input
          className="ws-col-search"
          placeholder="Filter columns…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="ws-col-list max-h-[50vh] overflow-y-auto mb-4">
        {filtered.map(header => {
          const isPinned = draft.pinned.includes(header);
          const isHidden = draft.hidden.includes(header);
          return (
            <div key={header} className="ws-col-row">
              <span className="ws-col-name" title={header}>{header}</span>
              <button
                type="button"
                className={`ws-col-action${isPinned ? ' active' : ''}`}
                onClick={() => togglePin(header)}
                title={isPinned ? 'Unpin from card' : 'Pin to cable card'}
              >
                <Pin size={14} />
              </button>
              <button
                type="button"
                className={`ws-col-action${isHidden ? ' active warn' : ''}`}
                onClick={() => toggleHidden(header)}
                title={isHidden ? 'Show in grid' : 'Hide from grid'}
              >
                {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-[13px] text-slate-400 py-4 text-center">No columns match.</p>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => { onSave(draft); onClose(); }}
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}
