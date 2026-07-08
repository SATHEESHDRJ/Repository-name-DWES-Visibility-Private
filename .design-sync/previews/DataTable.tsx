import { DataTable, Badge } from 'dwes';

interface CableRow {
  id: string;
  frame: string;
  from: string;
  to: string;
  colour: string;
  status: string;
}

const rows: CableRow[] = [
  { id: 'W-4021', frame: 'A12', from: 'MP-1', to: 'TB3-04', colour: 'GREEN', status: 'validated' },
  { id: 'W-4022', frame: 'A12', from: 'MP-1', to: 'TB3-05', colour: 'GREEN', status: 'validated' },
  { id: 'W-4023', frame: 'A12', from: 'MP-2', to: 'JB-11', colour: 'YELLOW', status: 'in_progress' },
  { id: 'W-4024', frame: 'B07', from: 'SP-1', to: 'TB1-02', colour: 'BLUE', status: 'in_review' },
  { id: 'W-4025', frame: 'B07', from: 'SP-1', to: 'TB1-03', colour: 'BROWN', status: 'rework' },
  { id: 'W-4026', frame: 'C31', from: 'CC-1', to: 'TB9-01', colour: 'BLACK', status: 'not_started' },
  { id: 'W-4027', frame: 'C31', from: 'CC-1', to: 'TB9-02', colour: 'GREEN', status: 'pending' },
];

const columns = [
  { key: 'id', header: 'Cable ID', accessor: (r: CableRow) => r.id, sortable: true, width: 120 },
  { key: 'frame', header: 'Frame', accessor: (r: CableRow) => r.frame, sortable: true, width: 90 },
  { key: 'from', header: 'From', accessor: (r: CableRow) => r.from, width: 100 },
  { key: 'to', header: 'To', accessor: (r: CableRow) => r.to, width: 100 },
  { key: 'colour', header: 'Colour', accessor: (r: CableRow) => r.colour, sortable: true, width: 110 },
  {
    key: 'status',
    header: 'Status',
    accessor: (r: CableRow) => r.status,
    render: (r: CableRow) => <Badge label={r.status} />,
    width: 150,
  },
];

export function CableSchedule() {
  return (
    <div style={{ width: 860 }}>
      <DataTable
        title="Cable Schedule — ENOWA-01"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchable
        exportable
        pagination={false}
      />
    </div>
  );
}
