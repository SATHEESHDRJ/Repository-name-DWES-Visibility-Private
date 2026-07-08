import { DashboardShell, Card, CardHeader, CardTitle, CardBody, Icon, useAuthStore } from 'dwes';

// Seed a signed-in technician so the shell's Topbar/AppShell (which read the auth
// store) render their populated state instead of the logged-out shell.
useAuthStore.setState({
  user: {
    id: '1',
    username: 'rhaddad',
    full_name: 'Rami Haddad',
    role: 'wiring_technician',
  },
  token: 'demo',
} as never);

export function TechnicianDashboard() {
  return (
    <DashboardShell
      title="Technician Dashboard"
      subtitle="ENOWA-01 · Substation 3 · Shift A"
      badge="On shift"
      badgeVariant="blue"
      kpis={[
        { label: 'Frames complete', value: '18 / 24', color: 'completed', icon: <Icon name="done_all" /> },
        { label: 'Cables wired', value: '1,204', color: 'progress', icon: <Icon name="cable" /> },
        { label: 'Awaiting QC', value: '6', color: 'pending', icon: <Icon name="pending_actions" /> },
      ]}
    >
      <Card>
        <CardHeader><CardTitle>Frame A12 — Main Panel</CardTitle></CardHeader>
        <CardBody>142 cables · 87% wired · last updated 3 minutes ago</CardBody>
      </Card>
    </DashboardShell>
  );
}
