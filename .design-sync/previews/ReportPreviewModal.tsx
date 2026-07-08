import { ReportPreviewModal } from 'dwes';
import { completionReportData } from './_fixtures';

export function Preview() {
  return (
    <ReportPreviewModal
      assignmentId={1}
      projectCode="ENOWA-01"
      frameId="A12"
      panelName="Main Panel"
      onClose={() => {}}
      loadReport={async () => completionReportData}
      showExport
    />
  );
}
