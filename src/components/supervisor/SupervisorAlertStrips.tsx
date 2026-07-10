import { useCallback, useEffect, useState } from 'react';
import { Activity } from '../ui/icons';
import { supervisorApi } from '../../services/api';
import { useDwesRefresh } from '../../hooks/useDwesRefresh';

interface Props {
  onNavigate?: (tab: string) => void;
}

export default function SupervisorAlertStrips({ onNavigate }: Props) {
  const [approvals, setApprovals] = useState(0);

  const loadCounts = useCallback(() => {
    supervisorApi.pendingApprovals().then(d => setApprovals((d || []).length)).catch(() => {});
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  useDwesRefresh(loadCounts, { listenFrames: false });

  if (approvals === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <button
        type="button"
        className="tech-strip flex-1 min-w-[220px] text-left cursor-pointer hover:opacity-90 transition-opacity"
        data-tone="warning"
        onClick={() => onNavigate?.('status')}
      >
        <Activity size={16} className="inline mr-2 shrink-0" />
        <strong>{approvals}</strong> legacy assignment{approvals !== 1 ? 's' : ''} awaiting optional review
      </button>
    </div>
  );
}
