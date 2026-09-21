import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { Tag } from '../ui/icons';
import { techApi } from '../../services/api';
import type { Cable } from '../../types';
import { collectScheduleCableTags } from './wiring/wiring-utils';

interface Props {
  assignmentId: number;
  defaultValue?: string;
  onClose: () => void;
  onApply: (tag: string) => void;
}

export default function TagCableWiseFilterModal({
  assignmentId,
  defaultValue = '',
  onClose,
  onApply,
}: Props) {
  const [tags, setTags] = useState<string[]>([]);
  const [selected, setSelected] = useState(defaultValue.trim());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    techApi.myAssignmentDetail(assignmentId)
      .then((data: { frame?: { cables?: Cable[] } | null }) => {
        if (cancelled) return;
        const next = collectScheduleCableTags(data.frame?.cables ?? []);
        setTags(next);
        setSelected(prev => (prev && next.includes(prev) ? prev : ''));
      })
      .catch(() => {
        if (cancelled) return;
        setTags([]);
        setLoadError('Could not load cable tags for this panel.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [assignmentId]);

  const canApply = !loading && !loadError && selected.trim().length > 0;

  return (
    <Modal
      title="Tag Cable-Wise Filter"
      subtitle="Select a cable tag from this panel’s Digital Wiring Schedule"
      icon={<Tag size={20} />}
      size="sm"
      onClose={onClose}
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canApply}
            onClick={() => {
              const next = selected.trim();
              if (!next) return;
              onApply(next);
            }}
          >
            Apply Filter
          </button>
        </>
      )}
    >
      <p className="text-sm text-muted mb-3">
        Matching wires stay available in the Digital Wiring Schedule.
      </p>

      {loading ? (
        <p className="text-sm text-muted" role="status">Loading cable tags…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600" role="alert">{loadError}</p>
      ) : tags.length === 0 ? (
        <p className="text-sm text-muted" role="status">
          No cable tags are available in this schedule.
        </p>
      ) : (
        <label className="block">
          <span className="sr-only">Cable tag</span>
          <select
            className="form-select w-full"
            value={selected}
            onChange={event => setSelected(event.target.value)}
            autoFocus
          >
            <option value="">Select a cable tag…</option>
            {tags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </label>
      )}
    </Modal>
  );
}
