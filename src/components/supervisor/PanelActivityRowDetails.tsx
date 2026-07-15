import { useState, useEffect } from 'react';
import { supervisorApi } from '../../services/api';
import type { PanelActivityData } from '../../types';
import PanelTechnicianActivity from './PanelTechnicianActivity';

export default function PanelActivityRowDetails({
  projectCode,
  frameId,
}: {
  projectCode: string;
  frameId: string;
}) {
  const [activity, setActivity] = useState<PanelActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    supervisorApi.panelActivity(projectCode, frameId, controller.signal)
      .then((data: any) => {
        if (!active) return;
        setActivity(data);
        setError('');
      })
      .catch((err: any) => {
        if (!active || err?.code === 'ERR_CANCELED') return;
        setError(err?.response?.data?.message || 'Failed to load technician activity');
        setActivity(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [projectCode, frameId]);

  return (
    <div className="bg-slate-50 border-t border-slate-200 p-4">
      <PanelTechnicianActivity activity={activity} loading={loading} error={error} />
    </div>
  );
}
