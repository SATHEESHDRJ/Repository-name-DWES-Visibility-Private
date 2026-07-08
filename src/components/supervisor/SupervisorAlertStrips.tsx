import { useEffect, useState } from 'react';
import { ArrowLeftRight, Activity } from '../ui/icons';
import { supervisorApi } from '../../services/api';

interface Props {
  onNavigate?: (tab: string) => void;
  /** Hide mid-changeover alerts (e.g. on Projects tab). */
  hideChangeover?: boolean;
}

export default function SupervisorAlertStrips({ onNavigate, hideChangeover = false }: Props) {
  const [approvals, setApprovals] = useState(0);
  const [changeovers, setChangeovers] = useState(0);

  useEffect(() => {
    Promise.all([
      supervisorApi.pendingApprovals().then(d => setApprovals((d || []).length)).catch(() => {}),
      supervisorApi.pendingChangeovers().then(d => setChangeovers((d || []).length)).catch(() => {}),
    ]).catch(() => {});
  }, []);

  const showChangeover = !hideChangeover && changeovers > 0;
  if (approvals === 0 && !showChangeover) return null;

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
      {showChangeover && (
        <button
          type="button"
          className="tech-strip flex-1 min-w-[220px] text-left cursor-pointer hover:opacity-90 transition-opacity"
          data-tone="info"
          onClick={() => onNavigate?.('projects')}
        >
          <ArrowLeftRight size={16} className="inline mr-2 shrink-0" />
          <strong>{changeovers}</strong> panel{changeovers !== 1 ? 's' : ''} eligible for mid-changeover — select panel on Projects
        </button>
      )}
    </div>
  );
}
