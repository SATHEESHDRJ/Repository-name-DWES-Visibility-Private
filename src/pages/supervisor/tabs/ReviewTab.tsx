import { useEffect, useState } from 'react';

import { supervisorApi } from '../../../services/api';
import Badge from '../../../components/Badge';

import Modal from '../../../components/Modal';

import ReportPreviewModal from '../../../components/ui/ReportPreviewModal';

import { FileText, CheckSquare, TriangleAlert } from '../../../components/ui/icons';

import PendingApprovalsSection from './PendingApprovalsSection';



type ReviewStatus = 'approved' | 'rework' | 'ready_for_qc';



interface ReviewTabProps {
  projectCode: string;
  panelId: string;
}



export default function ReviewTab({ projectCode, panelId }: ReviewTabProps) {

  const [panels, setPanels] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);

  const [showReview, setShowReview] = useState<any>(null);

  const [showReport, setShowReport] = useState<any>(null);



  const loadPanels = () => {

    if (!projectCode) {

      setPanels([]);

      return;

    }

    setLoading(true);

    supervisorApi.reviewPanels(projectCode)

      .then(data => {

        const list = panelId

          ? data.filter((p: any) => p.frame_id === panelId)

          : data;

        setPanels(list);

        setLoading(false);

      })

      .catch(() => setLoading(false));

  };



  useEffect(loadPanels, [projectCode, panelId]);



  return (

    <div>

      <PendingApprovalsSection />



      <div className="border-t border-slate-200 pt-6 mb-4">

        <h3 className="text-[15px] font-bold text-slate-900">Completed Panel Review</h3>

        <p className="text-[12px] text-slate-500 mt-0.5">

          Inspect finished work, validate quality, and submit approval decisions

        </p>

      </div>



      {!projectCode && (
        <div className="empty-state">
          <p className="empty-text">Select a project above to review completed panels.</p>
        </div>
      )}

      {projectCode && !panelId && (
        <div className="assignment-info-callout mb-4 flex items-start gap-1">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>Select a panel above to narrow reviews, or leave as all panels to see every completed panel in this project.</span>
        </div>
      )}

      {projectCode && loading && <div className="empty-state"><p className="empty-text">Loading panels...</p></div>}



      {projectCode && !loading && panels.length === 0 && (

        <div className="empty-state">

          <p className="empty-text">

            {panelId ? 'No completed panels to review for the selected panel.' : 'No completed panels to review for this project.'}

          </p>

        </div>

      )}



      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">

        {panels.map(panel => (

          <div key={panel.id} className="h-[120px] bg-[var(--t-surface-white)] border border-[#E2E8F0] rounded-[12px] p-4 flex flex-col justify-between shadow-sm hover:bg-blue-50 hover:border-blue-200 transition-colors">

            <div className="flex items-start justify-between">

              <div className="flex flex-col min-w-0 pr-2">

                <span className="text-[14px] font-bold text-slate-900 truncate" title={panel.panel_name}>{panel.panel_name}</span>

                <span className="text-[12px] font-medium text-slate-500 truncate mt-0.5">

                  {panel.technician_name} · {panel.completed_at ? new Date(panel.completed_at).toLocaleDateString() : 'unknown'}

                </span>

              </div>

              <div className="flex flex-col items-end flex-shrink-0">

                <span className="text-[18px] font-bold text-slate-800 leading-none">{panel.kpi ?? 0}%</span>

                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">KPI</span>

              </div>

            </div>



            <div className="flex items-center justify-between">

              <div className="flex items-center gap-2">

                <Badge label={panel.review_status || 'completed'} />

                <span className="text-[12px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-[6px]">

                  {panel.cables_src_done}/{panel.total_cables} done

                </span>

              </div>

              <div className="flex items-center gap-1">

                <button onClick={() => setShowReport(panel)} className="flex items-center justify-center h-[32px] px-2.5 bg-[var(--t-surface-white)] border border-[#E2E8F0] text-slate-600 rounded-[6px] hover:bg-slate-50 hover:text-blue-600 transition-colors text-[12px] font-bold" type="button">

                  <FileText size={14} strokeWidth={2} className="mr-1" />

                  Report

                </button>

                <button onClick={() => setShowReview(panel)} className="flex items-center justify-center h-[32px] px-2.5 bg-[var(--t-surface-white)] border border-[#E2E8F0] text-slate-600 rounded-[6px] hover:bg-slate-50 hover:text-purple-600 transition-colors text-[12px] font-bold" type="button">

                  <CheckSquare size={14} strokeWidth={2} className="mr-1" />

                  Review

                </button>

              </div>

            </div>

          </div>

        ))}

      </div>



      {showReview && (

        <ReviewModal panel={showReview} onClose={() => setShowReview(null)} onSaved={loadPanels} />

      )}



      {showReport && (

        <ReportPreviewModal

          assignmentId={showReport.id}

          projectCode={projectCode}

          frameId={showReport.frame_id}

          panelName={showReport.panel_name}

          onClose={() => setShowReport(null)}

        />

      )}

    </div>

  );

}



function ReviewModal({ panel, onClose, onSaved }: { panel: any; onClose: () => void; onSaved: () => void }) {

  const [status, setStatus] = useState<ReviewStatus>('approved');

  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');



  const handleSave = async () => {

    setSaving(true);

    setError('');

    try {

      await supervisorApi.review(panel.id, status, notes);

      onSaved();

      onClose();

    } catch (apiError: any) {

      setError(apiError?.response?.data?.message || 'Review failed');

    } finally {

      setSaving(false);

    }

  };



  const statusOptions: { value: ReviewStatus; label: string }[] = [

    { value: 'approved', label: 'Approved - Accepted as-is' },

    { value: 'ready_for_qc', label: 'Ready for QA/QC - Send to QA team' },

    { value: 'rework', label: 'Rework Required - Return to tech' },

  ];



  return (

    <Modal

      title="Review Panel"

      onClose={onClose}

      footer={(

        <>

          <button onClick={onClose} className="btn-secondary" type="button">Cancel</button>

          <button onClick={handleSave} disabled={saving} className="btn-primary" type="button">{saving ? 'Saving...' : 'Submit Review'}</button>

        </>

      )}

    >

      <div className="text-sm text-slate-700 mb-4">

        Panel: <span className="font-semibold text-slate-900">{panel.panel_name}</span>

      </div>



      <div className="mb-4">

        <label className="form-label mb-1">Decision</label>

        <div className="flex flex-col gap-2 mt-1">

          {statusOptions.map(option => (

            <label key={option.value} className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${status === option.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>

              <input type="radio" checked={status === option.value} onChange={() => setStatus(option.value)} className="accent-blue-600" />

              <span className="text-sm font-medium text-slate-800">{option.label}</span>

            </label>

          ))}

        </div>

      </div>



      <div>

        <label className="form-label mb-1">Notes (optional)</label>

        <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} placeholder="Additional review notes..." className="form-textarea" />

      </div>



      {error && <div className="form-error mt-2">{error}</div>}

    </Modal>

  );

}

