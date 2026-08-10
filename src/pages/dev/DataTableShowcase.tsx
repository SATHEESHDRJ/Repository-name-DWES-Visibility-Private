/**
 * DEV-ONLY showcase for the shared DataTable primitive.
 * Reachable at /ui-showcase in dev builds (see App.tsx). Not shipped to prod.
 */
import { useState } from 'react';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable';
import { Cable, Pencil, Eye, Trash2, CheckCircle2, Clock3, TriangleAlert } from '../../components/ui/icons';

interface CableRow {
  id: number;
  sno: number;
  ferrule: string;
  source: string;
  destination: string;
  size: string;
  length: number;
  technician: string;
  status: 'completed' | 'in_progress' | 'pending' | 'issue';
}

const TECHS = ['A. Al Farsi', 'R. Kumar', 'M. Haddad', 'S. Devi', 'J. Okafor', 'L. Chen'];
const SIZES = ['0.5mm²', '0.75mm²', '1.0mm²', '1.5mm²', '2.5mm²', '4.0mm²'];
const STATUSES: CableRow['status'][] = ['completed', 'in_progress', 'pending', 'issue'];

// Deterministic pseudo-random so the demo is stable across renders.
function seeded(i: number, mod: number) { return (i * 2654435761) % mod; }

const ROWS: CableRow[] = Array.from({ length: 47 }, (_, i) => ({
  id: i + 1,
  sno: i + 1,
  ferrule: `F${String(1000 + i * 7).padStart(4, '0')}`,
  source: `=+A${seeded(i, 6) + 1}-Q${seeded(i, 40) + 1}:${seeded(i, 12) + 1}`,
  destination: `=+B${seeded(i * 3, 6) + 1}-K${seeded(i * 5, 40) + 1}:${seeded(i * 2, 12) + 1}`,
  size: SIZES[seeded(i, SIZES.length)],
  length: 0.5 + seeded(i, 240) / 10,
  technician: TECHS[seeded(i, TECHS.length)],
  status: STATUSES[seeded(i, STATUSES.length)],
}));

function StatusBadge({ status }: { status: CableRow['status'] }) {
  const cfg = {
    completed:   { cls: 'badge-green',  icon: <CheckCircle2 size={12} />, label: 'Completed' },
    in_progress: { cls: 'badge-blue',   icon: <Clock3 size={12} />,       label: 'In Progress' },
    pending:     { cls: 'badge-gray',   icon: <Clock3 size={12} />,       label: 'Pending' },
    issue:       { cls: 'badge-red',    icon: <TriangleAlert size={12} />, label: 'Issue' },
  }[status];
  return <span className={cfg.cls}>{cfg.icon}{cfg.label}</span>;
}

export default function DataTableShowcase() {
  const [selectedCount, setSelectedCount] = useState(0);

  const columns: DataTableColumn<CableRow>[] = [
    { key: 'sno', header: 'S.No', accessor: r => r.sno, sortValue: r => r.sno, align: 'right', width: 72, hideable: false },
    {
      key: 'ferrule', header: 'Ferrule', accessor: r => r.ferrule, width: 120,
      render: r => <span className="font-mono font-semibold text-[13px]">{r.ferrule}</span>,
    },
    {
      key: 'source', header: 'Source', accessor: r => r.source, width: 200,
      render: r => <span className="font-mono text-[12px] text-blue-700">{r.source}</span>,
    },
    {
      key: 'destination', header: 'Destination', accessor: r => r.destination, width: 200,
      render: r => <span className="font-mono text-[12px] text-orange-700">{r.destination}</span>,
    },
    { key: 'size', header: 'Size', accessor: r => r.size, width: 110 },
    {
      key: 'length', header: 'Length (m)', accessor: r => r.length, sortValue: r => r.length, align: 'right', width: 120,
      render: r => <span className="tabular-nums">{r.length.toFixed(1)}</span>,
    },
    { key: 'technician', header: 'Technician', accessor: r => r.technician, width: 160 },
    {
      key: 'status', header: 'Status', accessor: r => r.status, width: 150,
      render: r => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <div className="max-w-[1440px] mx-auto p-6 flex flex-col gap-8">
        <header className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
            <Cable size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-[22px] font-extrabold" style={{ color: 'var(--color-on-surface)' }}>DataTable — Component Showcase</h1>
            <p className="text-[13px]" style={{ color: 'var(--color-on-surface-variant)' }}>
              Sort (click headers) · Resize (drag column edges) · Columns menu · Search · Select · Paginate · Export CSV
            </p>
          </div>
        </header>

        <section className="dash-module">
          <DataTable
            title="Cable Schedule"
            rows={ROWS}
            columns={columns}
            rowKey={r => r.id}
            storageKey="showcase-cables"
            searchable
            searchPlaceholder="Search ferrule, source, technician…"
            selectable
            onSelectionChange={rows => setSelectedCount(rows.length)}
            bulkActions={rows => (
              <>
                <button type="button" className="dt-btn"><CheckCircle2 size={16} /> Mark Complete ({rows.length})</button>
                <button type="button" className="dt-btn"><Trash2 size={16} /> Delete</button>
              </>
            )}
            columnToggle
            resizable
            exportable
            exportFileName="cable-schedule.csv"
            pagination
            pageSize={15}
            onRowClick={r => console.log('row click', r.ferrule)}
            rowActions={() => (
              <div className="flex items-center gap-1.5 justify-end">
                <button type="button" className="dt-btn dt-btn-ghost" title="View"><Eye size={16} /></button>
                <button type="button" className="dt-btn dt-btn-ghost" title="Edit"><Pencil size={16} /></button>
              </div>
            )}
          />
          <p className="mt-3 text-[12px]" style={{ color: 'var(--color-on-surface-variant)' }}>
            Live selection count (via <code>onSelectionChange</code>): <strong>{selectedCount}</strong>
          </p>
        </section>

        <section className="dash-module">
          <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--color-on-surface)' }}>Dense · loading state</h2>
          <DataTable
            rows={[]}
            columns={columns}
            rowKey={r => r.id}
            loading
            dense
            searchable={false}
            columnToggle={false}
            pagination={false}
          />
        </section>

        <section className="dash-module">
          <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--color-on-surface)' }}>Empty state</h2>
          <DataTable
            rows={[]}
            columns={columns}
            rowKey={r => r.id}
            searchable={false}
            columnToggle={false}
            pagination={false}
            emptyMessage="No cables match the current filter."
          />
        </section>
      </div>
    </div>
  );
}
