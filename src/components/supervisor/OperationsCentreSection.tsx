import { useState, useEffect, useCallback } from 'react';
import { jobsApi } from '../../services/api';
import { Icon } from '../ui/Icon';
import { RefreshCw, CheckCircle2, AlertCircle, Clock, XCircle, RotateCcw, HardDrive } from '../ui/icons';

interface BackgroundJob {
  id: string;
  job_type: string;
  project_code: string;
  frame_id: string;
  requested_by: number;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  attempts: number;
  max_attempts: number;
  safe_error?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

export default function OperationsCentreSection() {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [backupStarting, setBackupStarting] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await jobsApi.list();
      setJobs(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchJobs();
    const timer = setInterval(() => void fetchJobs(), 5000);
    return () => clearInterval(timer);
  }, [fetchJobs]);

  const handleRetry = async (id: string) => {
    setActioningId(id);
    try {
      await jobsApi.retry(id);
      await fetchJobs();
    } catch {
      /* ignore */
    } finally {
      setActioningId(null);
    }
  };

  const handleStartFullBackup = async () => {
    setBackupStarting(true);
    try {
      await jobsApi.enqueueBackupExport();
      await fetchJobs();
    } catch {
      /* ignore */
    } finally {
      setBackupStarting(false);
    }
  };

  const handleCancel = async (id: string) => {
    setActioningId(id);
    try {
      await jobsApi.cancel(id);
      await fetchJobs();
    } catch {
      /* ignore */
    } finally {
      setActioningId(null);
    }
  };

  const getStatusBadge = (status: BackgroundJob['status']) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <CheckCircle2 size={13} /> Completed
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 animate-pulse">
            <RefreshCw size={13} className="animate-spin" /> Processing
          </span>
        );
      case 'QUEUED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <Clock size={13} /> Queued
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
            <AlertCircle size={13} /> Failed
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <XCircle size={13} /> Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
            <Icon name="memory" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base">Processing & Operations Centre</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Background queue status, Excel/PDF/DWG processing & backups</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={backupStarting}
            onClick={() => void handleStartFullBackup()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-950/60 disabled:opacity-60"
            title="Queue full project backup (files + database)"
          >
            <HardDrive size={14} className={backupStarting ? 'animate-pulse' : ''} />
            {backupStarting ? 'Starting…' : 'Full backup'}
          </button>
          <button
            type="button"
            onClick={() => void fetchJobs()}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="Refresh Queue"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          No background jobs in queue.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 uppercase font-medium">
                <th className="py-2 px-3">Job Type</th>
                <th className="py-2 px-3">Project / Panel</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Progress</th>
                <th className="py-2 px-3">Created</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                    {job.job_type}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                    {job.project_code || '—'} {job.frame_id ? `/ ${job.frame_id}` : ''}
                  </td>
                  <td className="py-2.5 px-3">{getStatusBadge(job.status)}</td>
                  <td className="py-2.5 px-3 w-32">
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-600 h-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">{job.progress}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">
                    {new Date(job.created_at).toLocaleTimeString()}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {job.status === 'FAILED' && (
                        <button
                          type="button"
                          disabled={actioningId === job.id}
                          onClick={() => handleRetry(job.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded"
                        >
                          <RotateCcw size={12} /> Retry
                        </button>
                      )}
                      {(job.status === 'QUEUED' || job.status === 'PROCESSING') && (
                        <button
                          type="button"
                          disabled={actioningId === job.id}
                          onClick={() => handleCancel(job.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded"
                        >
                          <XCircle size={12} /> Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
