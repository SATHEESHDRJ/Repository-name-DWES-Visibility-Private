import { useEffect, useState } from 'react';

export type DirectorUpgradePreview = {
  workflow_id: number;
  project_code: string;
  frame_id: string;
  planning_template_version: string | null;
  target_version: string;
  label: string;
  display_version: string;
  already_director: boolean;
  renames: Array<{
    stage_id: number;
    from_key: string;
    to_key: string;
    from_name: string;
    to_name: string;
  }>;
  duration_updates: Array<{
    stage_id: number;
    stage_key: string;
    from_value: number | null;
    from_unit: string | null;
    to_value: number | null;
    to_unit: string | null;
    safe: boolean;
    warn: string | null;
  }>;
  adds: Array<{
    stage_key: string;
    name: string;
    sequence: number;
    default_duration_value: number | null;
    duration_unit: string | null;
  }>;
  legacy_retain: Array<{
    stage_id: number;
    stage_key: string;
    name: string;
    reason: string;
  }>;
  unused_archive_candidates: Array<{
    stage_id: number;
    stage_key: string;
    name: string;
  }>;
};

type Props = {
  open: boolean;
  preview: DirectorUpgradePreview | null;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (archiveKeys: string[]) => Promise<void>;
};

function fmtDur(value: number | null, unit: string | null): string {
  if (value == null) return '—';
  return `${value} ${unit || ''}`.trim();
}

export default function DirectorUpgradePreviewModal({
  open,
  preview,
  busy,
  error,
  onClose,
  onConfirm,
}: Props) {
  const [archiveKeys, setArchiveKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!preview) {
      setArchiveKeys([]);
      return;
    }
    // Default: archive unused legacy candidates
    setArchiveKeys(preview.unused_archive_candidates.map((c) => c.stage_key));
  }, [preview]);

  if (!open || !preview) return null;

  const toggleArchive = (key: string) => {
    setArchiveKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const isNoop = preview.already_director
    && preview.adds.length === 0
    && preview.renames.length === 0
    && preview.duration_updates.length === 0
    && preview.legacy_retain.length === 0
    && preview.unused_archive_candidates.length === 0;

  return (
    <div className="pw-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pw-modal pw-director-upgrade-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pw-director-upgrade-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pw-modal__head">
          <div>
            <h2 id="pw-director-upgrade-title">Apply Director Defaults</h2>
            <p className="pw-muted">
              Safe upgrade to {preview.label}. Existing progress and assignments are preserved.
            </p>
          </div>
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </header>

        {error && <div className="form-error">{error}</div>}

        {isNoop ? (
          <p className="pw-empty">This panel already has Director Planning Template v1 stages. No changes needed.</p>
        ) : (
          <div className="pw-director-upgrade-body">
            {preview.adds.length > 0 && (
              <section>
                <h3>Stages to add</h3>
                <ul>
                  {preview.adds.map((a) => (
                    <li key={a.stage_key}>
                      <strong>{a.name}</strong>
                      <span className="pw-muted"> ({a.stage_key})</span>
                      {a.default_duration_value != null && (
                        <span> — {fmtDur(a.default_duration_value, a.duration_unit)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {preview.renames.length > 0 && (
              <section>
                <h3>Renames</h3>
                <ul>
                  {preview.renames.map((r) => (
                    <li key={r.stage_id}>
                      {r.from_name} ({r.from_key}) → <strong>{r.to_name}</strong> ({r.to_key})
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {preview.duration_updates.length > 0 && (
              <section>
                <h3>Duration updates (unused / safe only)</h3>
                <ul>
                  {preview.duration_updates.map((d) => (
                    <li key={d.stage_id}>
                      <strong>{d.stage_key}</strong>:{' '}
                      {fmtDur(d.from_value, d.from_unit)} → {fmtDur(d.to_value, d.to_unit)}
                      {d.warn && <span className="pw-muted"> — {d.warn}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {preview.legacy_retain.length > 0 && (
              <section>
                <h3>Legacy stages retained (in use)</h3>
                <ul>
                  {preview.legacy_retain.map((l) => (
                    <li key={l.stage_id}>
                      <strong>{l.name}</strong> ({l.stage_key}) — {l.reason}
                      <span className="pw-badge pw-badge--legacy"> LEGACY — REVIEW REQUIRED</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {preview.unused_archive_candidates.length > 0 && (
              <section>
                <h3>Unused legacy stages — archive (disable)</h3>
                <ul className="pw-archive-list">
                  {preview.unused_archive_candidates.map((c) => (
                    <li key={c.stage_id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={archiveKeys.includes(c.stage_key)}
                          disabled={busy}
                          onChange={() => toggleArchive(c.stage_key)}
                        />
                        <span>
                          <strong>{c.name}</strong> ({c.stage_key})
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <footer className="pw-modal__foot">
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || isNoop}
            onClick={() => { void onConfirm(archiveKeys); }}
          >
            {busy ? 'Applying…' : 'Confirm upgrade'}
          </button>
        </footer>
      </div>
    </div>
  );
}
