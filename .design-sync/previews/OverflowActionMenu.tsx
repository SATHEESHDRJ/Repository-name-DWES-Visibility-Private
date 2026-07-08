import { OverflowActionMenu } from 'dwes';

export function RowActions() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: 320,
        padding: '0.6rem 0.9rem',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        background: '#fff',
      }}
    >
      <span>Frame A12 · Main Panel</span>
      <OverflowActionMenu
        actions={[
          { id: 'view', label: 'View details', onClick: () => {} },
          { id: 'reassign', label: 'Reassign technician', onClick: () => {} },
          { id: 'delete', label: 'Delete frame', destructive: true, onClick: () => {} },
        ]}
      />
    </div>
  );
}
