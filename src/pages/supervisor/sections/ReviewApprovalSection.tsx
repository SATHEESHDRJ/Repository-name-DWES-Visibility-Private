import SupervisorSectionHeader from '../../../components/supervisor/SupervisorSectionHeader';
import ReviewApprovalWorkspace from '../../../components/supervisor/ReviewApprovalWorkspace';

interface ReviewApprovalSectionProps {
  isActive?: boolean;
}

export default function ReviewApprovalSection({ isActive = true }: ReviewApprovalSectionProps) {
  return (
    <div className="flex flex-col min-w-0 gap-4">
      <SupervisorSectionHeader
        title="Status"
        description="Central workspace for project progress, wiring execution, supervisor review, QA/QC status, reporting, and director submission."
      />
      <ReviewApprovalWorkspace isActive={isActive} />
    </div>
  );
}
