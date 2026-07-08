import { Skeleton, SkeletonKpi, SkeletonTable, SkeletonList } from 'dwes';

export function Variants() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: 320 }}>
      <Skeleton variant="text" width="80%" />
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="rounded" height={40} />
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <Skeleton variant="circular" width={48} height={48} />
        <Skeleton variant="text" width="50%" />
      </div>
    </div>
  );
}

export function KpiPlaceholder() {
  return <div style={{ width: 280 }}><SkeletonKpi /></div>;
}

export function TablePlaceholder() {
  return <div style={{ width: 440 }}><SkeletonTable rows={4} columns={4} /></div>;
}

export function ListPlaceholder() {
  return <div style={{ width: 320 }}><SkeletonList items={3} /></div>;
}
