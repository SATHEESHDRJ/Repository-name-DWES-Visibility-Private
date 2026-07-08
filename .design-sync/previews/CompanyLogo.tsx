import { CompanyLogo } from 'dwes';

export function Full() {
  return <CompanyLogo variant="full" size="lg" />;
}

export function OnDarkPanel() {
  return (
    <div style={{ background: '#0f172a', padding: '1.5rem', display: 'inline-block', borderRadius: 12 }}>
      <CompanyLogo variant="white" size="md" />
    </div>
  );
}
