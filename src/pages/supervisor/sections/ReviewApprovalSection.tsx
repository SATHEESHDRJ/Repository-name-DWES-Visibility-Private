import CompactStatusWorkspace from '../../../components/supervisor/CompactStatusWorkspace';

interface ReviewApprovalSectionProps {
  isActive?: boolean;
}

export default function ReviewApprovalSection({ isActive = true }: ReviewApprovalSectionProps) {
  return (
    <div className="flex flex-col min-w-0 gap-3">
      <CompactStatusWorkspace isActive={isActive} />
    </div>
  );
}
