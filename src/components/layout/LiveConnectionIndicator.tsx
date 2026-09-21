import { useLiveConnection } from '../../store/useLiveConnection';

function formatUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-GB', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Shared shell indicator for SSE live vs 45s polling fallback.
 * Does not change transport behaviour — only surfaces existing connection state.
 */
export default function LiveConnectionIndicator() {
  const connected = useLiveConnection(s => s.connected);
  const lastEventAt = useLiveConnection(s => s.lastEventAt);
  const updated = formatUpdated(lastEventAt);
  const label = connected ? 'Live' : 'Polling';
  const detail = connected
    ? 'Server events connected'
    : 'Using 45-second polling fallback';

  return (
    <div
      className={`topbar-live-status${connected ? ' is-live' : ' is-polling'}`}
      title={updated ? `${detail}. Last event ${updated}` : detail}
      aria-label={updated ? `${label}. Last updated ${updated}` : label}
    >
      <span className="topbar-live-status__dot" aria-hidden="true" />
      <span className="topbar-live-status__label">{label}</span>
      {updated ? (
        <span className="topbar-live-status__updated hidden tablet-land:inline">
          Updated {updated}
        </span>
      ) : null}
    </div>
  );
}
