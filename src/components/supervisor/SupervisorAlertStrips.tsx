import { useCallback, useEffect, useState } from 'react';
import { Activity } from '../ui/icons';
import { supervisorApi } from '../../services/api';
import { useDwesRefresh } from '../../hooks/useDwesRefresh';

interface Props {
  onNavigate?: (tab: string) => void;
}

export default function SupervisorAlertStrips({ onNavigate }: Props) {
  const [approvals, setApprovals] = useState(0);
  const [midChanges, setMidChanges] = useState<any[]>([]);

  // Already updates the count in place and keeps the last good value on failure.
  const loadCounts = useCallback(() => {
    Promise.all([
      supervisorApi.pendingApprovals().catch(() => []),
      supervisorApi.pendingChangeovers().catch(() => []),
    ]).then(([approvalRows, midChangeRows]) => {
      setApprovals((approvalRows || []).length);
      setMidChanges(Array.isArray(midChangeRows) ? midChangeRows : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadCounts();
    const timer = window.setInterval(loadCounts, 12_000);
    return () => window.clearInterval(timer);
  }, [loadCounts]);

  useDwesRefresh(loadCounts, { listenFrames: true });

  if (approvals === 0 && midChanges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {approvals > 0 && (
        <button
          type="button"
          className="tech-strip flex-1 min-w-[220px] text-left cursor-pointer hover:opacity-90 transition-opacity"
          data-tone="warning"
          onClick={() => onNavigate?.('status')}
        >
          <Activity size={16} className="inline mr-2 shrink-0" />
          <strong>{approvals}</strong> legacy assignment{approvals !== 1 ? 's' : ''} awaiting optional review
        </button>
      )}
      {midChanges.length > 0 && (
        <div className="tech-strip flex-1 min-w-[260px] text-left" data-tone="info" role="status">
          <Activity size={16} className="inline mr-2 shrink-0" />
          <strong>{midChanges.length}</strong> Mid Change request{midChanges.length !== 1 ? 's' : ''} awaiting technician confirmation
          <span className="mt-1 block whitespace-normal break-words text-[11px] opacity-80">
            {midChanges.slice(0, 2).map(request => (
              `${request.initiator_name}: ${request.source?.panel_name || 'panel'} ↔ ${request.target?.panel_name || 'panel'}`
            )).join(' · ')}
          </span>
        </div>
      )}
    </div>
  );
}
