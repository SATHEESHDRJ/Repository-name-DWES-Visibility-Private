import { EmptyState, EmptyStateIllustration, Button } from 'dwes';

export function NoData() {
  return (
    <div style={{ minWidth: 320 }}>
      <EmptyState
        icon={<EmptyStateIllustration type="no-data" />}
        title="No frames assigned"
        description="You have no frames assigned for this shift. Check back once your supervisor allocates work."
      />
    </div>
  );
}

export function SearchWithAction() {
  return (
    <div style={{ minWidth: 320 }}>
      <EmptyState
        icon={<EmptyStateIllustration type="search" />}
        title="No matching cables"
        description="No cables match your current filter. Try clearing the search to see everything on this frame."
        action={<Button variant="secondary">Clear filters</Button>}
      />
    </div>
  );
}
