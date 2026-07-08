import { Card, CardHeader, CardTitle, CardBody } from 'dwes';

export function Basic() {
  return (
    <div style={{ minWidth: 280 }}>
      <Card>
        <CardHeader><CardTitle>Frame A12 — Main Panel</CardTitle></CardHeader>
        <CardBody>
          <p style={{ margin: 0 }}>142 cables · 87% wired · updated 3 min ago</p>
        </CardBody>
      </Card>
    </div>
  );
}

export function Hoverable() {
  return (
    <div style={{ minWidth: 280 }}>
      <Card hoverable>
        <CardHeader><CardTitle>Project ENOWA-01</CardTitle></CardHeader>
        <CardBody>Tap to open the wiring workstation for this project.</CardBody>
      </Card>
    </div>
  );
}
