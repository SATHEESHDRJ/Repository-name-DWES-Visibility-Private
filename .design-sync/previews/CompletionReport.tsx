import { CompletionReport } from 'dwes';
import { completionReportData } from './_fixtures';

export function Approved() {
  return (
    <div style={{ width: 720 }}>
      <CompletionReport data={completionReportData} onDownloadXlsx={() => {}} />
    </div>
  );
}
